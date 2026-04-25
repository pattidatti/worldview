import { useEffect, useRef, useCallback, useState } from 'react';
import {
    CustomDataSource,
    Entity,
    Cartesian3,
    Cartographic,
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
import { useLayerActions, useLayerVisibility } from '@/store/layerStore';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { useGeointRegistry } from '@/context/GeointContext';
import { useGates } from '@/context/GateContext';
import { useTimelineEvents } from '@/context/TimelineEventContext';
import { writeCrossings } from '@/services/crossingSync';
import { useTimelineMode, useCursor, CURSOR_JUMP_THRESHOLD_MS } from '@/context/TimelineModeContext';
import { useReplayEntities } from '@/hooks/useReplayEntities';
import { useViewport } from '@/hooks/useViewport';
import { configureCluster } from '@/utils/cluster';
import { AISStreamConnection } from '@/services/aisstream';
import { type Ship } from '@/types/ship';
import {
    detectEntityCrossings,
    type EntityPosition,
} from '@/utils/crossingDetector';
import { TrailBuffer } from '@/utils/trailBuffer';
import {
    getShipTypeName,
    getNavStatusText,
    getFlagState,
    createShipIconWithStatus,
    getShipDimensions,
    getShipComponents,
    getShipColorCss,
    getNavStatusColor,
    SHIP_DARK_MS,
} from '@/utils/ship-utils';

const API_KEY = import.meta.env.VITE_AISSTREAM_API_KEY || '';
const MAX_SHIPS = 1000;
const MAX_SHIP_TRAIL = 60;
const SHIP_STALE_MS = 60 * 60 * 1000; // fjern skip som ikke har rapportert på 60 min
const SHIP_TRAIL_COLOR = Color.fromCssColorString('#00d4ff');
const SHIP_BATCH_MS = 5_000; // AISStreamConnection batches updates every 5s — brukes som staleness-referanse
const SHIP_CROSSING_STALENESS_MS = 2 * SHIP_BATCH_MS;

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
    const { setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } = useLayerActions();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const { register: geointRegister, unregister: geointUnregister } = useGeointRegistry();
    const { gates } = useGates();
    const { append: appendTimelineEvents } = useTimelineEvents();
    const gatesRef = useRef(gates);
    gatesRef.current = gates;
    const appendEventsRef = useRef(appendTimelineEvents);
    appendEventsRef.current = appendTimelineEvents;
    const lastEntityStateRef = useRef<Map<string, EntityPosition>>(new Map());
    const visible = useLayerVisibility('ships');
    const viewport = useViewport(viewer);
    const viewportRef = useRef(viewport);
    viewportRef.current = viewport;
    const hasViewport = viewport !== null;
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const superDsRef = useRef<CustomDataSource | null>(null);
    const trailDsRef = useRef<CustomDataSource | null>(null);
    const labelDsRef = useRef<CustomDataSource | null>(null);
    const trailHistoryRef = useRef<Map<string, TrailBuffer<Cartesian3>>>(new Map());
    const connRef = useRef<AISStreamConnection | null>(null);
    const shipTimestampsRef = useRef<Map<number, number>>(new Map());
    const [ships, setShips] = useState<Map<number, Ship>>(new Map());
    const shipsRef = useRef<Map<number, Ship>>(new Map());
    shipsRef.current = ships;
    const visibleRef = useRef(visible);
    visibleRef.current = visible;
    const { mode, modeEpoch } = useTimelineMode();
    const cursor = useCursor();
    const isReplay = mode === 'replay';
    const replayResult = useReplayEntities('ship', cursor);
    const replayEntities = replayResult.entities;
    const lastCursorRef = useRef(cursor);

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
            const navColor = getNavStatusColor(ship.navStatus);
            const dims = ship.length && ship.width
                ? `${ship.length} × ${ship.width} m`
                : '';
            const isDark = ship.lastSeen > 0 && (Date.now() - ship.lastSeen) > SHIP_DARK_MS;
            const minutesDark = isDark ? Math.floor((Date.now() - ship.lastSeen) / 60_000) : 0;
            const popupColor = isDark ? '#ff2200' : (navColor ?? '#00d4ff');
            return {
                title: ship.name || `MMSI ${ship.mmsi}`,
                icon: isDark ? '📵' : '⚓',
                color: popupColor,
                followEntityId: String(ship.mmsi),
                fields: [
                    ...(isDark ? [{ label: '⚠ MØRKT SKIP', value: `Signal mistet for ${minutesDark} min siden` }] : []),
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
        if (!viewer || viewer.isDestroyed()) return;
        const labelDs = new CustomDataSource('ships-labels');
        viewer.dataSources.add(labelDs);
        labelDsRef.current = labelDs;
        return () => {
            if (!viewer.isDestroyed()) viewer.dataSources.remove(labelDs, true);
            labelDsRef.current = null;
        };
    }, [viewer]);

    useEffect(() => {
        if (dataSourceRef.current) dataSourceRef.current.show = visible;
        if (superDsRef.current) superDsRef.current.show = visible;
        if (trailDsRef.current) trailDsRef.current.show = visible;
        if (labelDsRef.current) labelDsRef.current.show = visible;
    }, [visible]);

    // Connect to AIS stream — pauses i replay-modus.
    useEffect(() => {
        if (!visible || !API_KEY || !hasViewport) return;
        if (isReplay) return;
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
    }, [visible, hasViewport, isReplay]);

    // Replay-drevet state: når i replay-modus, driv `ships` fra useReplayEntities.
    useEffect(() => {
        if (!isReplay) return;
        const next = new Map<number, Ship>();
        for (const s of replayEntities) {
            next.set(s.mmsi, {
                ...s,
                lastSeen: cursor,
            });
        }
        setShips(next);
        setLayerLastUpdated('ships', cursor);
    }, [isReplay, replayEntities, cursor, setLayerLastUpdated]);

    // Mode-switch og stor cursor-jump: nullstill trails + ship-state.
    useEffect(() => {
        const jumpLarge = Math.abs(cursor - lastCursorRef.current) > CURSOR_JUMP_THRESHOLD_MS;
        lastCursorRef.current = cursor;
        if (!jumpLarge && modeEpoch === 0) return;
        trailHistoryRef.current.clear();
        lastEntityStateRef.current.clear();
        shipTimestampsRef.current.clear();
        const ds = dataSourceRef.current;
        const superDs = superDsRef.current;
        const trailDs = trailDsRef.current;
        if (ds) ds.entities.removeAll();
        if (superDs) superDs.entities.removeAll();
        if (trailDs) trailDs.entities.removeAll();
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [modeEpoch, cursor, viewer]);

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
        const labelDs = labelDsRef.current;
        if (!ds) return;
        setLayerCount('ships', ships.size);
        const existing = new Map<string, Entity>();
        for (const entity of ds.entities.values) existing.set(entity.id, entity);
        const seen = new Set<string>();

        const crossingEvents = [] as ReturnType<typeof detectEntityCrossings>;
        const gatesForDetection = gatesRef.current;
        const detectOptions = { maxStalenessMs: SHIP_CROSSING_STALENESS_MS };
        const nowMs = Date.now();

        for (const [mmsi, ship] of ships) {
            const id = String(mmsi);
            seen.add(id);

            // Gate-crossing deteksjon (før entity-sync — bruker AIS-posisjonen rett fra state).
            if (gatesForDetection.length > 0) {
                const prevState = lastEntityStateRef.current.get(id);
                const currState: EntityPosition = {
                    pos: { lat: ship.lat, lon: ship.lon },
                    ts: nowMs,
                };
                if (prevState) {
                    const events = detectEntityCrossings(
                        id,
                        'ship',
                        prevState,
                        currState,
                        gatesForDetection,
                        detectOptions,
                    );
                    if (events.length > 0) crossingEvents.push(...events);
                }
                lastEntityStateRef.current.set(id, currState);
            }

            const dims = getShipDimensions(ship.shipType, ship.length, ship.width);
            const components = getShipComponents(ship.shipType, dims);
            const effectiveH = ship.heading >= 0 && ship.heading <= 360 ? ship.heading : ship.course;
            const isDark = ship.lastSeen > 0 && (Date.now() - ship.lastSeen) > SHIP_DARK_MS;
            const navStatusColor = getNavStatusColor(ship.navStatus);
            const shipBillboard = createShipIconWithStatus(effectiveH, ship.shipType, navStatusColor, isDark);

            // Bruk globens faktiske terreng-høyde som base for å kompensere for ikke-uniform ellipsoide
            const SEA_OFFSET = 1;
            const _carto = Cartographic.fromDegrees(ship.lon, ship.lat);
            const terrainH = viewer?.scene.globe.getHeight(_carto) ?? 50;
            const baseAlt = Math.max(0, terrainH) + SEA_OFFSET;
            const seaPos = Cartesian3.fromDegrees(ship.lon, ship.lat, baseAlt);
            const hullPos = Cartesian3.fromDegrees(ship.lon, ship.lat, baseAlt + dims.height / 2);
            const orientation = buildOrientation(seaPos, effectiveH);
            const maxCompTop = components.reduce(
                (max, c) => Math.max(max, c.vertBase + c.height),
                dims.height,
            );
            const labelPos = Cartesian3.fromDegrees(ship.lon, ship.lat, baseAlt + maxCompTop + 10);
            const labelId = `${id}-lbl`;

            const entity = existing.get(id);
            if (entity) {
                (entity.position as ConstantPositionProperty).setValue(hullPos);
                (entity.orientation as ConstantProperty).setValue(orientation);
                if (entity.billboard?.image) {
                    (entity.billboard.image as ConstantProperty).setValue(shipBillboard);
                }
                if (entity.billboard && !entity.billboard.alignedAxis) {
                    entity.billboard.alignedAxis = new ConstantProperty(Cartesian3.UNIT_Z);
                }
                const labelEntity = labelDs?.entities.getById(labelId);
                if (labelEntity) {
                    (labelEntity.position as ConstantPositionProperty).setValue(labelPos);
                    if (labelEntity.label?.text) {
                        (labelEntity.label.text as ConstantProperty).setValue(ship.name || `MMSI ${mmsi}`);
                    }
                } else if (labelDs) {
                    labelDs.entities.add(new Entity({
                        id: labelId,
                        position: labelPos,
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
                }
                if (entity.box?.dimensions) {
                    (entity.box.dimensions as ConstantProperty).setValue(
                        new Cartesian3(dims.width, dims.length, dims.height),
                    );
                }
                // Oppdater hull-farge (endres når shipType ankommer via ShipStaticData)
                if (entity.box?.material !== undefined) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (entity.box.material as any) = Color.fromCssColorString(getShipColorCss(ship.shipType)).withAlpha(0.95);
                }
                // Oppdater overbygningskomponenter — opprett manglende, fjern ekstra
                // (skjer typisk når ShipStaticData ankommer etter PositionReport og endrer shipType)
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
                        if (compEntity.box?.material !== undefined) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            (compEntity.box.material as any) = Color.fromCssColorString(comp.css).withAlpha(0.97);
                        }
                    } else if (superDs) {
                        superDs.entities.add(new Entity({
                            id: compId,
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
                // Fjern ekstra komponenter (f.eks. ved type-overgang passasjerskip→lasteskip: 5→3 komp.)
                for (let i = components.length + 1; i <= 7; i++) {
                    superDs?.entities.removeById(`${id}::c${i}`);
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
                        image: shipBillboard,
                        width: 22,
                        height: 22,
                        verticalOrigin: VerticalOrigin.CENTER,
                        horizontalOrigin: HorizontalOrigin.CENTER,
                        heightReference: HeightReference.NONE,
                        disableDepthTestDistance: Number.POSITIVE_INFINITY,
                        alignedAxis: Cartesian3.UNIT_Z,
                    },
                }));
                if (labelDs) {
                    labelDs.entities.add(new Entity({
                        id: labelId,
                        position: labelPos,
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
                }
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
                let history = trailHistoryRef.current.get(id);
                if (!history) {
                    history = new TrailBuffer<Cartesian3>(MAX_SHIP_TRAIL);
                    trailHistoryRef.current.set(id, history);
                }
                history.push(seaPos.clone());
                const positions = history.toArray();
                // Spiss: siste 5 posisjoner
                const tipId = `trail-tip-${id}`;
                const tip = history.tail(5);
                const tipEntity = trailDs.entities.getById(tipId);
                if (tip.length >= 2) {
                    if (tipEntity?.polyline?.positions) {
                        (tipEntity.polyline.positions as ConstantProperty).setValue(tip);
                    } else {
                        trailDs.entities.add(new Entity({
                            id: tipId,
                            polyline: {
                                positions: new ConstantProperty(tip),
                                width: 2.5,
                                material: new PolylineGlowMaterialProperty({ glowPower: 0.5, color: SHIP_TRAIL_COLOR.withAlpha(0.9) }),
                                clampToGround: false,
                            },
                        }));
                    }
                } else if (tipEntity) trailDs.entities.removeById(tipId);

                // Kropp: posisjoner 5-20
                const trailId = `trail-${id}`;
                const body = positions.slice(0, Math.max(0, positions.length - 5));
                const trailEntity = trailDs.entities.getById(trailId);
                if (body.length >= 2) {
                    if (trailEntity?.polyline?.positions) {
                        (trailEntity.polyline.positions as ConstantProperty).setValue(body);
                    } else {
                        trailDs.entities.add(new Entity({
                            id: trailId,
                            polyline: {
                                positions: new ConstantProperty(body),
                                width: 1.5,
                                material: new PolylineGlowMaterialProperty({ glowPower: 0.1, color: SHIP_TRAIL_COLOR.withAlpha(0.3) }),
                                clampToGround: false,
                            },
                        }));
                    }
                } else if (trailEntity) {
                    trailDs.entities.removeById(trailId);
                }
            }
        }

        for (const [id] of existing) {
            if (!seen.has(id)) {
                ds.entities.removeById(id);
                for (let i = 1; i <= 7; i++) superDs?.entities.removeById(`${id}::c${i}`);
                if (trailDs) { trailDs.entities.removeById(`trail-tip-${id}`); trailDs.entities.removeById(`trail-${id}`); }
                labelDs?.entities.removeById(`${id}-lbl`);
                trailHistoryRef.current.delete(id);
                lastEntityStateRef.current.delete(id);
            }
        }
        if (crossingEvents.length > 0) {
            appendEventsRef.current(crossingEvents);
            void writeCrossings(crossingEvents);
        }
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [ships, viewer, setLayerCount]);

    useEffect(() => { updateEntities(); }, [updateEntities]);

    if (!API_KEY) return null;
    return null;
}
