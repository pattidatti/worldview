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
    ParticleSystem,
    ConeEmitter,
    PrimitiveCollection,
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
    SHIP_GHOST_FADE_MS,
    GHOST_DRIFT_RATE_MPS,
    GHOST_MAX_RING_M,
} from '@/utils/ship-utils';
import { useDarkShips, shipToDarkRecord } from '@/context/DarkShipsContext';
import { checkSanctions } from '@/services/sanctions';
import { isSpringAnimating } from '@/utils/springEntities';

const API_KEY = import.meta.env.VITE_AISSTREAM_API_KEY || '';
const MAX_SHIPS = 1000;
const MAX_SHIP_TRAIL = 60;
const SHIP_STALE_MS = 60 * 60 * 1000; // fjern skip som ikke har rapportert på 60 min
const SHIP_TRAIL_COLOR = Color.fromCssColorString('#00d4ff');
const SHIP_BATCH_MS = 5_000; // AISStreamConnection batches updates every 5s — brukes som staleness-referanse
const SHIP_CROSSING_STALENESS_MS = 2 * SHIP_BATCH_MS;
const WAKE_SPEED_THRESHOLD = 1.5; // knop — under dette vises ikke kjølvann

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

/** Offset lateralt (styrbord = positiv, babord = negativ) + opp fra origin */
function computeLateralOffset(
    origin: Cartesian3,
    heading: number,
    lateralDist: number,
    upDist: number,
): Cartesian3 {
    const h = CesiumMath.toRadians(heading >= 0 && heading <= 360 ? heading : 0);
    Transforms.eastNorthUpToFixedFrame(origin, undefined, _enuMatrix);
    const ex = _enuMatrix[0], ey = _enuMatrix[1], ez = _enuMatrix[2];
    const nx = _enuMatrix[4], ny = _enuMatrix[5], nz = _enuMatrix[6];
    const ux = _enuMatrix[8], uy = _enuMatrix[9], uz = _enuMatrix[10];
    const cosH = Math.cos(h), sinH = Math.sin(h);
    // Styrbord-retning = cosH * øst - sinH * nord
    const sbx = cosH * ex - sinH * nx;
    const sby = cosH * ey - sinH * ny;
    const sbz = cosH * ez - sinH * nz;
    return new Cartesian3(
        origin.x + sbx * lateralDist + ux * upDist,
        origin.y + sby * lateralDist + uy * upDist,
        origin.z + sbz * lateralDist + uz * upDist,
    );
}

/** Generer glødende navigasjonslys-sprite som data URI */
function makeNavLightSprite(r: number, g: number, b: number): string {
    const c = document.createElement('canvas');
    c.width = c.height = 20;
    const ctx = c.getContext('2d')!;
    const grd = ctx.createRadialGradient(10, 10, 1, 10, 10, 10);
    grd.addColorStop(0, `rgba(${r},${g},${b},1.0)`);
    grd.addColorStop(0.35, `rgba(${r},${g},${b},0.6)`);
    grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 20, 20);
    return c.toDataURL();
}

/** Generer røyk-sprite som data URI */
function makeSmokeSprite(): string {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d')!;
    const grd = ctx.createRadialGradient(16, 16, 2, 16, 16, 16);
    grd.addColorStop(0, 'rgba(180,178,174,0.85)');
    grd.addColorStop(0.5, 'rgba(165,163,159,0.45)');
    grd.addColorStop(1, 'rgba(150,148,145,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(16, 16, 16, 0, Math.PI * 2);
    ctx.fill();
    return c.toDataURL();
}

type CesiumParticle = { velocity: Cartesian3; imageSize: Cartesian2 };
const SMOKE_CB = (particle: CesiumParticle, dt: number) => {
    // Røyk stiger sakte og sprer seg
    particle.velocity.z += 0.6 * dt;
    particle.imageSize.x = Math.min(particle.imageSize.x * (1 + 0.45 * dt), 22);
    particle.imageSize.y = Math.min(particle.imageSize.y * (1 + 0.45 * dt), 22);
};

// Avstandsgrense — nav-lys og radar kun synlig < 25 km
const NAV_RANGE = new DistanceDisplayCondition(0, 25_000);
const NAV_SCALE = new NearFarScalar(200, 2.0, 25_000, 0.0);

export function ShipLayer() {
    const viewer = useViewer();
    const { setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } = useLayerActions();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const { register: geointRegister, unregister: geointUnregister } = useGeointRegistry();
    const { gates } = useGates();
    const { append: appendTimelineEvents } = useTimelineEvents();
    const { setDarkShips } = useDarkShips();
    const setDarkShipsRef = useRef(setDarkShips);
    setDarkShipsRef.current = setDarkShips;
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
    const wakeDsRef = useRef<CustomDataSource | null>(null);
    const ghostDsRef = useRef<CustomDataSource | null>(null);
    const navlightDsRef = useRef<CustomDataSource | null>(null);
    const smokeCollRef = useRef<PrimitiveCollection | null>(null);
    const smokeMapRef = useRef<Map<number, ParticleSystem>>(new Map());
    const sweepAnglesRef = useRef<Map<number, number>>(new Map());
    const navSpritesRef = useRef<{ port: string; star: string; mast: string } | null>(null);
    const smokeSpriteRef = useRef<string | null>(null);
    const ghostsRef = useRef<Map<number, { ship: Ship; disappearedAt: number }>>(new Map());
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
            const baseFields = [
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
            ];
            const capturedImo = ship.imo;
            return {
                title: ship.name || `MMSI ${ship.mmsi}`,
                icon: isDark ? '📵' : '⚓',
                color: popupColor,
                followEntityId: String(ship.mmsi),
                fields: baseFields,
                linkUrl: `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${ship.mmsi}`,
                linkLabel: 'Se på MarineTraffic →',
                enrichAsync: capturedImo ? async () => {
                    const sanction = await checkSanctions(capturedImo);
                    if (!sanction) return {};
                    return {
                        fields: [
                            { label: '🚫 OFAC SDN', value: sanction.name },
                            { label: 'Program', value: sanction.programs.slice(0, 2).join(', ') || 'Ukjent' },
                            ...(sanction.remarks ? [{ label: 'Merknad', value: sanction.remarks.slice(0, 120) }] : []),
                            ...baseFields,
                        ],
                    };
                } : undefined,
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
        if (!viewer || viewer.isDestroyed()) return;
        const wakeDs = new CustomDataSource('ships-wakes');
        viewer.dataSources.add(wakeDs);
        wakeDsRef.current = wakeDs;
        return () => {
            if (!viewer.isDestroyed()) viewer.dataSources.remove(wakeDs, true);
            wakeDsRef.current = null;
        };
    }, [viewer]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ghostDs = new CustomDataSource('ships-ghosts');
        viewer.dataSources.add(ghostDs);
        ghostDsRef.current = ghostDs;
        return () => {
            if (!viewer.isDestroyed()) viewer.dataSources.remove(ghostDs, true);
            ghostDsRef.current = null;
            ghostsRef.current.clear();
        };
    }, [viewer]);

    // Navigasjonslys + radar-sweep datasource
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const navDs = new CustomDataSource('ships-navlights');
        viewer.dataSources.add(navDs);
        navlightDsRef.current = navDs;
        // Lag sprite-cache én gang
        navSpritesRef.current = {
            port: makeNavLightSprite(255, 45, 45),
            star: makeNavLightSprite(50, 230, 90),
            mast: makeNavLightSprite(255, 255, 255),
        };
        return () => {
            if (!viewer.isDestroyed()) viewer.dataSources.remove(navDs, true);
            navlightDsRef.current = null;
        };
    }, [viewer]);

    // Røykpartikkel-samling (Cesium Primitive)
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        smokeSpriteRef.current = makeSmokeSprite();
        const coll = new PrimitiveCollection();
        viewer.scene.primitives.add(coll);
        smokeCollRef.current = coll;
        return () => {
            if (!viewer.isDestroyed()) viewer.scene.primitives.remove(coll);
            smokeCollRef.current = null;
            smokeMapRef.current.clear();
        };
    }, [viewer]);

    useEffect(() => {
        if (dataSourceRef.current) dataSourceRef.current.show = visible;
        if (superDsRef.current) superDsRef.current.show = visible;
        if (trailDsRef.current) trailDsRef.current.show = visible;
        if (labelDsRef.current) labelDsRef.current.show = visible;
        if (wakeDsRef.current) wakeDsRef.current.show = visible;
        if (ghostDsRef.current) ghostDsRef.current.show = visible;
        if (navlightDsRef.current) navlightDsRef.current.show = visible;
        if (smokeCollRef.current) smokeCollRef.current.show = visible;
        if (!visible) setDarkShipsRef.current([]);
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
                // Fjern skip som ikke har rapportert posisjon på 60 min
                const staleThreshold = now - SHIP_STALE_MS;
                for (const [mmsi, ship] of merged) {
                    if ((shipTimestampsRef.current.get(mmsi) ?? 0) < staleThreshold) {
                        const wasDark = ship.lastSeen > 0 && (now - ship.lastSeen) > SHIP_DARK_MS;
                        if (wasDark && !ghostsRef.current.has(mmsi)) {
                            ghostsRef.current.set(mmsi, { ship, disappearedAt: now });
                        }
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
        if (wakeDsRef.current) wakeDsRef.current.entities.removeAll();
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
        const wakeDs = wakeDsRef.current;
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
            const isCritical = ship.navStatus === 2 || ship.navStatus === 14;
            const shipBillboard = createShipIconWithStatus(effectiveH, ship.shipType, navStatusColor, isDark, isCritical);

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
                if (!isSpringAnimating(entity))
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
                    if (!isSpringAnimating(labelEntity))
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
                    (entity.box.material as any) = Color.fromCssColorString(getShipColorCss(ship.shipType)).withAlpha(1.0);
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
                            (compEntity.box.material as any) = Color.fromCssColorString(comp.css).withAlpha(1.0);
                        }
                    } else if (superDs) {
                        superDs.entities.add(new Entity({
                            id: compId,
                            position: compPos,
                            orientation,
                            box: {
                                dimensions: new Cartesian3(dims.width * comp.wFrac, dims.length * comp.lFrac, comp.height),
                                material: Color.fromCssColorString(comp.css).withAlpha(1.0),
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
                        material: hullColor.withAlpha(1.0),
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
                                material: Color.fromCssColorString(comp.css).withAlpha(1.0),
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

            // Kjølvann-effekt: hvit ellipse bak bevegelige skip
            if (wakeDs) {
                const wakeId = `${id}-wake`;
                const existingWake = wakeDs.entities.getById(wakeId);
                if (ship.speed > WAKE_SPEED_THRESHOLD) {
                    const wakeScale = Math.min(1.5 + ship.speed / 8, 4.0);
                    const semiMajor = dims.length * wakeScale;
                    const semiMinor = dims.width * 1.8;
                    const wakePos = Cartesian3.fromDegrees(ship.lon, ship.lat, 0);
                    const wakeRotation = -CesiumMath.toRadians(effectiveH);
                    if (existingWake) {
                        (existingWake.position as ConstantPositionProperty).setValue(wakePos);
                        (existingWake.ellipse!.semiMajorAxis as ConstantProperty).setValue(semiMajor);
                        (existingWake.ellipse!.semiMinorAxis as ConstantProperty).setValue(semiMinor);
                        (existingWake.ellipse!.rotation as ConstantProperty).setValue(wakeRotation);
                    } else {
                        wakeDs.entities.add(new Entity({
                            id: wakeId,
                            position: wakePos,
                            ellipse: {
                                semiMajorAxis: semiMajor,
                                semiMinorAxis: semiMinor,
                                heightReference: HeightReference.CLAMP_TO_GROUND,
                                rotation: wakeRotation,
                                material: Color.WHITE.withAlpha(0.22),
                                fill: true,
                                outline: false,
                            },
                        }));
                    }
                } else if (existingWake) {
                    wakeDs.entities.remove(existingWake);
                }
            }

            // --- NAVIGASJONSLYS ---
            const navDs = navlightDsRef.current;
            const sprites = navSpritesRef.current;
            if (navDs && sprites) {
                const bridgeHeight = maxCompTop + 3;
                const portPos = computeLateralOffset(seaPos, effectiveH, -dims.width * 0.5, bridgeHeight);
                const starPos = computeLateralOffset(seaPos, effectiveH, dims.width * 0.5, bridgeHeight);
                const mastPos = computeShipOffset(seaPos, effectiveH, dims.length * 0.3, dims.height + 12);

                const navDefs = [
                    { navId: `nl-port-${id}`, pos: portPos, img: sprites.port },
                    { navId: `nl-star-${id}`, pos: starPos, img: sprites.star },
                    { navId: `nl-mast-${id}`, pos: mastPos, img: sprites.mast },
                ];
                for (const nav of navDefs) {
                    const e = navDs.entities.getById(nav.navId);
                    if (e) {
                        (e.position as ConstantPositionProperty).setValue(nav.pos);
                    } else {
                        navDs.entities.add(new Entity({
                            id: nav.navId,
                            position: nav.pos,
                            billboard: {
                                image: nav.img,
                                width: 14,
                                height: 14,
                                verticalOrigin: VerticalOrigin.CENTER,
                                horizontalOrigin: HorizontalOrigin.CENTER,
                                heightReference: HeightReference.NONE,
                                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                                alignedAxis: Cartesian3.UNIT_Z,
                                scaleByDistance: NAV_SCALE,
                                distanceDisplayCondition: NAV_RANGE,
                            },
                        }));
                    }
                }

                // Radar-sweep linje
                const radarId = `radar-${id}`;
                const sweepAngle = sweepAnglesRef.current.get(mmsi) ?? 0;
                const sweepH = (effectiveH + sweepAngle) % 360;
                const radarEnd = computeShipOffset(seaPos, sweepH, 3500, maxCompTop + 15);
                const radarEntity = navDs.entities.getById(radarId);
                if (radarEntity?.polyline?.positions) {
                    (radarEntity.polyline.positions as ConstantProperty).setValue([seaPos, radarEnd]);
                } else {
                    navDs.entities.add(new Entity({
                        id: radarId,
                        polyline: {
                            positions: new ConstantProperty([seaPos, radarEnd]),
                            width: 1.5,
                            material: new PolylineGlowMaterialProperty({
                                color: Color.fromCssColorString('#00ff88').withAlpha(0.55),
                                glowPower: 0.5,
                            }),
                            clampToGround: false,
                            distanceDisplayCondition: NAV_RANGE,
                        },
                    }));
                }
            }

            // --- RØYKPARTIKLER ---
            const smokeColl = smokeCollRef.current;
            const smokeImg = smokeSpriteRef.current;
            if (smokeColl && smokeImg) {
                const fwdFrac = ship.shipType >= 60 && ship.shipType <= 69 ? -0.14
                    : ship.shipType >= 40 && ship.shipType <= 49 ? -0.05
                    : -0.35;
                const funnelPos = computeShipOffset(seaPos, effectiveH, fwdFrac * dims.length, maxCompTop + 4);
                const smokeMatrix = Transforms.eastNorthUpToFixedFrame(funnelPos);
                const existingSmoke = smokeMapRef.current.get(mmsi);
                if (existingSmoke) {
                    existingSmoke.modelMatrix = smokeMatrix;
                    existingSmoke.emissionRate = Math.max(1, Math.min(6, ship.speed * 0.8 + 1));
                } else {
                    const ps = new ParticleSystem({
                        image: smokeImg,
                        emitter: new ConeEmitter(0.25),
                        emissionRate: Math.max(1, Math.min(6, ship.speed * 0.8 + 1.5)),
                        minimumParticleLife: 3,
                        maximumParticleLife: 7,
                        minimumSpeed: 1.5,
                        maximumSpeed: 3.5,
                        minimumImageSize: new Cartesian2(3, 3),
                        maximumImageSize: new Cartesian2(7, 7),
                        startColor: Color.fromCssColorString('rgba(175,172,168,0.7)'),
                        endColor: Color.fromCssColorString('rgba(155,153,150,0.0)'),
                        updateCallback: SMOKE_CB as unknown as (particle: object, dt: number) => void,
                        lifetime: -1,
                        modelMatrix: smokeMatrix,
                    });
                    smokeColl.add(ps);
                    smokeMapRef.current.set(mmsi, ps);
                }
            }
        }

        for (const [id] of existing) {
            if (!seen.has(id)) {
                const mmsiNum = Number(id);
                ds.entities.removeById(id);
                for (let i = 1; i <= 7; i++) superDs?.entities.removeById(`${id}::c${i}`);
                if (trailDs) { trailDs.entities.removeById(`trail-tip-${id}`); trailDs.entities.removeById(`trail-${id}`); }
                wakeDs?.entities.removeById(`${id}-wake`);
                labelDs?.entities.removeById(`${id}-lbl`);
                // Rydd nav-lys + radar
                const navDs = navlightDsRef.current;
                if (navDs) {
                    navDs.entities.removeById(`nl-port-${id}`);
                    navDs.entities.removeById(`nl-star-${id}`);
                    navDs.entities.removeById(`nl-mast-${id}`);
                    navDs.entities.removeById(`radar-${id}`);
                }
                // Rydd røyk
                const smoke = smokeMapRef.current.get(mmsiNum);
                if (smoke && smokeCollRef.current) {
                    smokeCollRef.current.remove(smoke);
                    smokeMapRef.current.delete(mmsiNum);
                }
                sweepAnglesRef.current.delete(mmsiNum);
                trailHistoryRef.current.delete(id);
                lastEntityStateRef.current.delete(id);
            }
        }
        if (crossingEvents.length > 0) {
            appendEventsRef.current(crossingEvents);
            void writeCrossings(crossingEvents);
        }

        // Ghost-entiteter: mørke skip som har forlatt AIS-strømmen
        const ghostDs = ghostDsRef.current;
        const darkRecords = [] as ReturnType<typeof shipToDarkRecord>[];

        // Legg til aktive mørke skip (fortsatt i AIS, men signal tapt)
        for (const [, ship] of ships) {
            const isDark = ship.lastSeen > 0 && (nowMs - ship.lastSeen) > SHIP_DARK_MS;
            if (isDark) darkRecords.push(shipToDarkRecord(ship, false, getFlagState(ship.mmsi)));
        }

        if (ghostDs) {
            for (const [mmsi, ghost] of ghostsRef.current) {
                const age = nowMs - ghost.disappearedAt;
                if (age > SHIP_GHOST_FADE_MS) {
                    ghostDs.entities.removeById(`ghost-${mmsi}`);
                    ghostDs.entities.removeById(`ghost-ring-${mmsi}`);
                    ghostsRef.current.delete(mmsi);
                    continue;
                }

                darkRecords.push(shipToDarkRecord(ghost.ship, true, getFlagState(ghost.ship.mmsi)));

                const fadeT = 1 - age / SHIP_GHOST_FADE_MS;
                const ghostAlpha = fadeT * 0.35;
                const ghostPos = Cartesian3.fromDegrees(ghost.ship.lon, ghost.ship.lat, 80);
                const ghostId = `ghost-${mmsi}`;
                const ringId = `ghost-ring-${mmsi}`;

                const existingGhost = ghostDs.entities.getById(ghostId);
                if (existingGhost) {
                    (existingGhost.billboard!.color as ConstantProperty).setValue(
                        Color.fromCssColorString('#ff2200').withAlpha(ghostAlpha)
                    );
                } else {
                    const effectiveH = ghost.ship.heading >= 0 && ghost.ship.heading <= 360
                        ? ghost.ship.heading : ghost.ship.course;
                    ghostDs.entities.add(new Entity({
                        id: ghostId,
                        position: ghostPos,
                        billboard: {
                            image: createShipIconWithStatus(effectiveH, ghost.ship.shipType, null, true),
                            width: 26,
                            height: 26,
                            color: Color.fromCssColorString('#ff2200').withAlpha(ghostAlpha),
                            verticalOrigin: VerticalOrigin.CENTER,
                            horizontalOrigin: HorizontalOrigin.CENTER,
                            heightReference: HeightReference.NONE,
                            disableDepthTestDistance: Number.POSITIVE_INFINITY,
                            alignedAxis: Cartesian3.UNIT_Z,
                        },
                    }));
                }

                // Voksende usikkerhets-ring (maks driftsradius siden forsvinnelse)
                const driftRadiusM = Math.min(
                    (age / 1000) * GHOST_DRIFT_RATE_MPS,
                    GHOST_MAX_RING_M,
                );
                const ringAlpha = fadeT * 0.5;
                const existingRing = ghostDs.entities.getById(ringId);
                if (existingRing) {
                    (existingRing.ellipse!.semiMajorAxis as ConstantProperty).setValue(driftRadiusM);
                    (existingRing.ellipse!.semiMinorAxis as ConstantProperty).setValue(driftRadiusM);
                    (existingRing.ellipse!.outlineColor as ConstantProperty).setValue(
                        Color.fromCssColorString('#ff2200').withAlpha(ringAlpha)
                    );
                } else {
                    ghostDs.entities.add(new Entity({
                        id: ringId,
                        position: Cartesian3.fromDegrees(ghost.ship.lon, ghost.ship.lat, 0),
                        ellipse: {
                            semiMajorAxis: Math.max(driftRadiusM, 1000),
                            semiMinorAxis: Math.max(driftRadiusM, 1000),
                            heightReference: HeightReference.CLAMP_TO_GROUND,
                            material: Color.fromCssColorString('#ff2200').withAlpha(0.04),
                            outline: true,
                            outlineColor: Color.fromCssColorString('#ff2200').withAlpha(ringAlpha),
                            outlineWidth: 1.5,
                        },
                    }));
                }
            }
        }

        setDarkShipsRef.current(darkRecords);

        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [ships, viewer, setLayerCount]);

    useEffect(() => { updateEntities(); }, [updateEntities]);

    // Radar-sweep roterer 6° per 250ms → ~15s per omdreing
    useEffect(() => {
        if (!visible || !viewer) return;
        const intervalId = setInterval(() => {
            const navDs = navlightDsRef.current;
            if (!navDs || viewer.isDestroyed()) return;
            for (const [mmsi, ship] of shipsRef.current) {
                const shipId = String(mmsi);
                const prev = sweepAnglesRef.current.get(mmsi) ?? 0;
                const next = (prev + 6) % 360;
                sweepAnglesRef.current.set(mmsi, next);
                const radarEntity = navDs.entities.getById(`radar-${shipId}`);
                if (!radarEntity?.polyline?.positions) continue;
                const dims = getShipDimensions(ship.shipType, ship.length, ship.width);
                const effH = ship.heading >= 0 && ship.heading <= 360 ? ship.heading : ship.course;
                const _c = Cartographic.fromDegrees(ship.lon, ship.lat);
                const terrH = viewer.scene.globe.getHeight(_c) ?? 50;
                const baseAlt = Math.max(0, terrH) + 1;
                const seaP = Cartesian3.fromDegrees(ship.lon, ship.lat, baseAlt);
                const comps = getShipComponents(ship.shipType, dims);
                const maxTop = comps.reduce((m, c) => Math.max(m, c.vertBase + c.height), dims.height);
                const sweepH = (effH + next) % 360;
                const radarEnd = computeShipOffset(seaP, sweepH, 3500, maxTop + 15);
                (radarEntity.polyline.positions as ConstantProperty).setValue([seaP, radarEnd]);
            }
        }, 250);
        return () => clearInterval(intervalId);
    }, [visible, viewer]);

    // Render-løkke for partikkelanimasjon (20fps mens skip-laget er synlig)
    useEffect(() => {
        if (!viewer || !visible) return;
        const renderId = setInterval(() => {
            if (!viewer.isDestroyed()) viewer.scene.requestRender();
        }, 50);
        return () => clearInterval(renderId);
    }, [viewer, visible]);

    if (!API_KEY) return null;
    return null;
}
