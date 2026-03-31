import { useEffect, useRef, useCallback, useState } from 'react';
import {
    CustomDataSource,
    Entity,
    Cartesian3,
    Color,
    ConstantPositionProperty,
    ConstantProperty,
    NearFarScalar,
    DistanceDisplayCondition,
    Transforms,
    HeadingPitchRoll,
    Math as CesiumMath,
    Matrix4,
    PolylineGlowMaterialProperty,
    VerticalOrigin,
    HorizontalOrigin,
    HeightReference,
    LabelStyle,
    Cartesian2,
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { useGeointRegistry } from '@/context/GeointContext';
import { useViewport } from '@/hooks/useViewport';
import { configureCluster } from '@/utils/cluster';
import { AISStreamConnection } from '@/services/aisstream';
import { type Ship } from '@/types/ship';
import {
    getShipTypeName,
    getNavStatusText,
    getFlagState,
    createShipIcon,
    getShipDimensions,
    getShipComponents,
    getShipColorCss,
} from '@/utils/ship-utils';

const API_KEY = import.meta.env.VITE_AISSTREAM_API_KEY || '';
const MAX_SHIPS = 1000;
const MAX_SHIP_TRAIL = 60;
const SHIP_STALE_MS = 15 * 60 * 1000; // fjern skip som ikke har rapportert på 15 min
const SHIP_TRAIL_COLOR = Color.fromCssColorString('#00d4ff');

// Navn-label vises 0–150 km, krymper gradvis
const LABEL_RANGE = new DistanceDisplayCondition(0, 150_000);
const LABEL_SCALE = new NearFarScalar(5_000, 1.0, 150_000, 0.45);

/** Beregner orienterings-quaternion fra AIS-heading */
function buildOrientation(pos: Cartesian3, heading: number) {
    const h = heading >= 0 && heading <= 360 ? heading : 0;
    return Transforms.headingPitchRollQuaternion(
        pos,
        new HeadingPitchRoll(CesiumMath.toRadians(h), 0, 0),
    );
}

/** Gjenbrukbar matrise — unngår allokering per skip per oppdatering */
const _enuMatrix = new Matrix4();

/**
 * Beregner en ECEF-posisjon forskjøvet fra origin:
 * - forwardDist: meter fremover langs skipets heading (negativt = akter)
 * - upDist: meter over vannlinjen
 */
function computeShipOffset(
    origin: Cartesian3,
    heading: number,
    forwardDist: number,
    upDist: number,
): Cartesian3 {
    const h = CesiumMath.toRadians(heading >= 0 && heading <= 360 ? heading : 0);
    Transforms.eastNorthUpToFixedFrame(origin, undefined, _enuMatrix);
    // Kolonner i Matrix4 (column-major): [0-2]=øst, [4-6]=nord, [8-10]=opp
    const ex = _enuMatrix[0], ey = _enuMatrix[1], ez = _enuMatrix[2];
    const nx = _enuMatrix[4], ny = _enuMatrix[5], nz = _enuMatrix[6];
    const ux = _enuMatrix[8], uy = _enuMatrix[9], uz = _enuMatrix[10];
    const sinH = Math.sin(h), cosH = Math.cos(h);
    return new Cartesian3(
        origin.x + (sinH * ex + cosH * nx) * forwardDist + ux * upDist,
        origin.y + (sinH * ey + cosH * ny) * forwardDist + uy * upDist,
        origin.z + (sinH * ez + cosH * nz) * forwardDist + uz * upDist,
    );
}

export function ShipLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const { register: geointRegister, unregister: geointUnregister } = useGeointRegistry();
    const visible = isVisible('ships');
    const viewport = useViewport(viewer);
    const viewportRef = useRef(viewport);
    viewportRef.current = viewport;
    const hasViewport = viewport !== null;
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const superDsRef = useRef<CustomDataSource | null>(null);
    const trailDsRef = useRef<CustomDataSource | null>(null);
    const trailHistoryRef = useRef<Map<string, Cartesian3[]>>(new Map());
    const connRef = useRef<AISStreamConnection | null>(null);
    const shipTimestampsRef = useRef<Map<number, number>>(new Map());
    const [ships, setShips] = useState<Map<number, Ship>>(new Map());
    const shipsRef = useRef<Map<number, Ship>>(new Map());
    shipsRef.current = ships;
    const visibleRef = useRef(visible);
    visibleRef.current = visible;

    // GEOINT data provider
    useEffect(() => {
        geointRegister('ships', () => {
            if (!visibleRef.current || shipsRef.current.size === 0) return null;
            const items = [...shipsRef.current.values()].slice(0, 10).map((s) =>
                `${s.name || `MMSI ${s.mmsi}`} ${getShipTypeName(s.shipType)} ${s.speed.toFixed(1)}kn${s.destination ? ` → ${s.destination}` : ''}`
            );
            return { layerId: 'ships', label: 'Skipstrafikk', count: shipsRef.current.size, items };
        });
        return () => geointUnregister('ships');
    }, [geointRegister, geointUnregister]);

    // Register popup builder (håndterer klikk på hull OG overbygning)
    useEffect(() => {
        const builder = (entity: Entity) => {
            const inHull = dataSourceRef.current?.entities.contains(entity);
            const inSuper = superDsRef.current?.entities.contains(entity);
            if (!inHull && !inSuper) return null;
            // ID er enten "${mmsi}" (hull) eller "${mmsi}-c${n}" (overbygningskomponent)
            // MMSI er alltid 9 sifre, aldri bokstaver, så splitteren ::c er unik
            const rawId = entity.id;
            const mmsiStr = rawId.includes('::c') ? rawId.split('::c')[0] : rawId;
            const ship = shipsRef.current.get(Number(mmsiStr));
            if (!ship) return null;
            const navText = getNavStatusText(ship.navStatus);
            const dims = ship.length && ship.width
                ? `${ship.length} × ${ship.width} m`
                : '';
            return {
                title: ship.name || `MMSI ${ship.mmsi}`,
                icon: '⚓',
                color: '#00d4ff',
                followEntityId: String(ship.mmsi),
                fields: [
                    { label: 'Type', value: getShipTypeName(ship.shipType) },
                    { label: 'Flagg', value: getFlagState(ship.mmsi) },
                    ...(navText ? [{ label: 'Status', value: navText }] : []),
                    { label: 'Hastighet', value: ship.speed.toFixed(1), unit: 'kn' },
                    { label: 'Kurs', value: `${Math.round(ship.course)}°` },
                    ...(dims ? [{ label: 'Størrelse', value: dims }] : []),
                    ...(ship.draught ? [{ label: 'Dypgang', value: ship.draught.toFixed(1), unit: 'm' }] : []),
                    ...(ship.callSign ? [{ label: 'Kallesignal', value: ship.callSign }] : []),
                    ...(ship.imo ? [{ label: 'IMO', value: ship.imo }] : []),
                    ...(ship.destination ? [{ label: 'Destinasjon', value: ship.destination }] : []),
                    { label: 'MMSI', value: ship.mmsi },
                ],
                linkUrl: `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${ship.mmsi}`,
                linkLabel: 'Se på MarineTraffic →',
            };
        };
        register('ships', builder);
        register('ships-super', builder);
        return () => { unregister('ships'); unregister('ships-super'); };
    }, [register, unregister]);

    // Register tooltip builder
    useEffect(() => {
        const tipBuilder = (entity: Entity) => {
            const inHull = dataSourceRef.current?.entities.contains(entity);
            const inSuper = superDsRef.current?.entities.contains(entity);
            if (!inHull && !inSuper) return null;
            const rawId = entity.id;
            const mmsiStr = rawId.includes('::c') ? rawId.split('::c')[0] : rawId;
            const ship = shipsRef.current.get(Number(mmsiStr));
            if (!ship) return null;
            return {
                title: ship.name || `MMSI ${ship.mmsi}`,
                subtitle: `${getShipTypeName(ship.shipType)} · ${ship.speed.toFixed(1)} kn`,
                icon: '⚓',
                color: '#00d4ff',
            };
        };
        tooltipRegister('ships', tipBuilder);
        tooltipRegister('ships-super', tipBuilder);
        return () => { tooltipUnregister('ships'); tooltipUnregister('ships-super'); };
    }, [tooltipRegister, tooltipUnregister]);

    // Create data source
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('ships');
        configureCluster(ds, { pixelRange: 45, minimumClusterSize: 3, color: '#00d4ff' });
        viewer.dataSources.add(ds);
        dataSourceRef.current = ds;
        return () => {
            if (!viewer.isDestroyed()) viewer.dataSources.remove(ds, true);
            dataSourceRef.current = null;
        };
    }, [viewer]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const superDs = new CustomDataSource('ships-super');
        viewer.dataSources.add(superDs);
        superDsRef.current = superDs;
        return () => {
            if (!viewer.isDestroyed()) viewer.dataSources.remove(superDs, true);
            superDsRef.current = null;
        };
    }, [viewer]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const trailDs = new CustomDataSource('ships-trails');
        viewer.dataSources.add(trailDs);
        trailDsRef.current = trailDs;
        const trailHistory = trailHistoryRef.current;
        return () => {
            if (!viewer.isDestroyed()) viewer.dataSources.remove(trailDs, true);
            trailDsRef.current = null;
            trailHistory.clear();
        };
    }, [viewer]);

    useEffect(() => {
        if (dataSourceRef.current) dataSourceRef.current.show = visible;
        if (superDsRef.current) superDsRef.current.show = visible;
        if (trailDsRef.current) trailDsRef.current.show = visible;
    }, [visible]);

    // Connect to AIS stream
    useEffect(() => {
        if (!visible || !API_KEY || !hasViewport) return;
        setLayerLoading('ships', true);
        const conn = new AISStreamConnection(API_KEY, viewportRef.current!, (updatedShips) => {
            const now = Date.now();
            // Oppdater sist-sett-tidsstempel for alle skip i batchen
            for (const [mmsi] of updatedShips) {
                shipTimestampsRef.current.set(mmsi, now);
            }
            setShips(prev => {
                const merged = new Map(prev);
                // Legg til / oppdater nye skip
                for (const [mmsi, ship] of updatedShips) {
                    merged.set(mmsi, ship);
                }
                // Fjern skip som ikke har rapportert posisjon på 15 min
                const staleThreshold = now - SHIP_STALE_MS;
                for (const [mmsi] of merged) {
                    if ((shipTimestampsRef.current.get(mmsi) ?? 0) < staleThreshold) {
                        merged.delete(mmsi);
                        shipTimestampsRef.current.delete(mmsi);
                    }
                }
                // Behold maks MAX_SHIPS — prioriter nyest sett
                if (merged.size > MAX_SHIPS) {
                    const sorted = [...merged.entries()].sort(
                        (a, b) => (shipTimestampsRef.current.get(b[0]) ?? 0) - (shipTimestampsRef.current.get(a[0]) ?? 0)
                    );
                    return new Map(sorted.slice(0, MAX_SHIPS));
                }
                return merged;
            });
            setLayerLoading('ships', false);
            setLayerError('ships', null);
            setLayerLastUpdated('ships', Date.now());
        }, (errorMsg) => {
            setLayerError('ships', errorMsg);
        });
        conn.connect();
        connRef.current = conn;
        return () => {
            conn.disconnect();
            connRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, hasViewport]);

    // Update viewport on camera move (re-subscribe with new bounding box)
    useEffect(() => {
        if (!viewport || !connRef.current) return;
        connRef.current.updateViewport(viewport);
    }, [viewport]);

    // Sync entities to Cesium
    const updateEntities = useCallback(() => {
        const ds = dataSourceRef.current;
        const superDs = superDsRef.current;
        const trailDs = trailDsRef.current;
        if (!ds) return;
        setLayerCount('ships', ships.size);
        const existing = new Map<string, Entity>();
        for (const entity of ds.entities.values) existing.set(entity.id, entity);
        const seen = new Set<string>();

        for (const [mmsi, ship] of ships) {
            const id = String(mmsi);
            seen.add(id);

            const dims = getShipDimensions(ship.shipType, ship.length, ship.width);
            const components = getShipComponents(ship.shipType, dims);
            const effectiveH = ship.heading >= 0 && ship.heading <= 360 ? ship.heading : ship.course;

            // Havnivå-posisjon (basis for offset-beregninger)
            const seaPos = Cartesian3.fromDegrees(ship.lon, ship.lat, 0);
            // Skrogets sentrum: halvparten av skroghøyden over vannlinjen
            const hullPos = Cartesian3.fromDegrees(ship.lon, ship.lat, dims.height / 2);
            const orientation = buildOrientation(seaPos, effectiveH);

            const entity = existing.get(id);
            if (entity) {
                (entity.position as ConstantPositionProperty).setValue(hullPos);
                (entity.orientation as ConstantProperty).setValue(orientation);
                if (entity.billboard?.image) {
                    (entity.billboard.image as ConstantProperty).setValue(createShipIcon(effectiveH, ship.shipType));
                }
                if (entity.label?.text) {
                    (entity.label.text as ConstantProperty).setValue(ship.name || `MMSI ${mmsi}`);
                }
                if (entity.box?.dimensions) {
                    (entity.box.dimensions as ConstantProperty).setValue(
                        new Cartesian3(dims.width, dims.length, dims.height),
                    );
                }
                // Oppdater overbygningskomponenter
                for (let i = 0; i < components.length; i++) {
                    const comp = components[i];
                    const compId = `${id}::c${i + 1}`;
                    const compPos = computeShipOffset(
                        seaPos, effectiveH,
                        comp.fwdFrac * dims.length,
                        comp.vertBase + comp.height / 2,
                    );
                    const compEntity = superDs?.entities.getById(compId);
                    if (compEntity) {
                        (compEntity.position as ConstantPositionProperty).setValue(compPos);
                        (compEntity.orientation as ConstantProperty).setValue(orientation);
                        if (compEntity.box?.dimensions) {
                            (compEntity.box.dimensions as ConstantProperty).setValue(
                                new Cartesian3(dims.width * comp.wFrac, dims.length * comp.lFrac, comp.height),
                            );
                        }
                    }
                }
            } else {
                const hullColor = Color.fromCssColorString(getShipColorCss(ship.shipType));
                // Skrog-entitet (med billboard, label og trail-tilknytning)
                ds.entities.add(new Entity({
                    id,
                    name: ship.name || `MMSI ${mmsi}`,
                    position: hullPos,
                    orientation,
                    box: {
                        dimensions: new Cartesian3(dims.width, dims.length, dims.height),
                        material: hullColor.withAlpha(0.95),
                        outline: true,
                        outlineColor: Color.BLACK.withAlpha(0.3),
                    },
                    billboard: {
                        image: createShipIcon(effectiveH, ship.shipType),
                        width: 22,
                        height: 22,
                        verticalOrigin: VerticalOrigin.CENTER,
                        horizontalOrigin: HorizontalOrigin.CENTER,
                        heightReference: HeightReference.NONE,
                        disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    },
                    label: {
                        text: ship.name || `MMSI ${mmsi}`,
                        font: '11px Inter, sans-serif',
                        fillColor: Color.WHITE,
                        outlineColor: Color.BLACK.withAlpha(0.8),
                        outlineWidth: 2,
                        style: LabelStyle.FILL_AND_OUTLINE,
                        verticalOrigin: VerticalOrigin.BOTTOM,
                        horizontalOrigin: HorizontalOrigin.CENTER,
                        pixelOffset: new Cartesian2(0, -18),
                        scaleByDistance: LABEL_SCALE,
                        distanceDisplayCondition: LABEL_RANGE,
                        disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    },
                }));
                // Overbygningskomponenter — lagvise bokser i 'ships-super'
                if (superDs) {
                    for (let i = 0; i < components.length; i++) {
                        const comp = components[i];
                        const compPos = computeShipOffset(
                            seaPos, effectiveH,
                            comp.fwdFrac * dims.length,
                            comp.vertBase + comp.height / 2,
                        );
                        superDs.entities.add(new Entity({
                            id: `${id}::c${i + 1}`,
                            position: compPos,
                            orientation,
                            box: {
                                dimensions: new Cartesian3(dims.width * comp.wFrac, dims.length * comp.lFrac, comp.height),
                                material: Color.fromCssColorString(comp.css).withAlpha(0.97),
                                outline: true,
                                outlineColor: Color.BLACK.withAlpha(0.22),
                            },
                        }));
                    }
                }
            }

            if (trailDs) {
                const history = trailHistoryRef.current.get(id) ?? [];
                history.push(seaPos.clone());
                if (history.length > MAX_SHIP_TRAIL) history.shift();
                trailHistoryRef.current.set(id, history);
                const trailId = `trail-${id}`;
                const trailEntity = trailDs.entities.getById(trailId);
                if (trailEntity?.polyline?.positions) {
                    (trailEntity.polyline.positions as ConstantProperty).setValue([...history]);
                } else if (history.length >= 2) {
                    trailDs.entities.add(new Entity({
                        id: trailId,
                        polyline: {
                            positions: new ConstantProperty([...history]),
                            width: 1.5,
                            material: new PolylineGlowMaterialProperty({
                                glowPower: 0.2,
                                color: SHIP_TRAIL_COLOR.withAlpha(0.7),
                            }),
                            clampToGround: false,
                        },
                    }));
                }
            }
        }

        for (const [id] of existing) {
            if (!seen.has(id)) {
                ds.entities.removeById(id);
                for (let i = 1; i <= 7; i++) superDs?.entities.removeById(`${id}::c${i}`);
                if (trailDs) trailDs.entities.removeById(`trail-${id}`);
                trailHistoryRef.current.delete(id);
            }
        }
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [ships, viewer, setLayerCount]);

    useEffect(() => { updateEntities(); }, [updateEntities]);

    if (!API_KEY) return null;
    return null;
}
