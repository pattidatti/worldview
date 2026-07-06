import { useEffect, useRef, useCallback, useState } from 'react';
import {
    CustomDataSource,
    Entity,
    Cartesian3,
    Color,
    ConstantPositionProperty,
    ConstantProperty,
    PolylineGlowMaterialProperty,
    HeightReference,
    VerticalOrigin,
    HorizontalOrigin,
    Math as CesiumMath,
    ModelGraphics,
    Transforms,
    HeadingPitchRoll,
    NearFarScalar,
} from 'cesium';
import { getAircraftGltf, classifyAircraftType } from '@/utils/aircraftGltf';
import { useViewer } from '@/context/ViewerContext';
import { useCinematic } from '@/context/CinematicContext';
import { useLayerActions, useLayerVisibility } from '@/store/layerStore';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { useGeointRegistry } from '@/context/GeointContext';
import { useGates } from '@/context/GateContext';
import { useTimelineEventActions } from '@/context/TimelineEventContext';
import { writeCrossings } from '@/services/crossingSync';
import { useTimelineMode, useReplayCursor, CURSOR_JUMP_THRESHOLD_MS } from '@/context/TimelineModeContext';
import { useReplayEntities } from '@/hooks/useReplayEntities';
import { useViewport } from '@/hooks/useViewport';
import { configureCluster } from '@/utils/cluster';
import { fetchFlights } from '@/services/airplaneslive';
import { fetchFlightRoute, getCachedRoute } from '@/services/opensky';
import { lookupAirline } from '@/data/airlines';
import { spawnPulseRing } from '@/utils/pulseRing';
import { fadeInEntity, fadeOutEntity } from '@/utils/entityFade';
import { isSpringAnimating } from '@/utils/springEntities';
import { type Flight } from '@/types/flight';
import {
    detectEntityCrossings,
    type EntityPosition,
} from '@/utils/crossingDetector';
import { TrailBuffer } from '@/utils/trailBuffer';
import { extrapolateGreatCircle, DR_MAX_AGE_MS, FLIGHT_POLL_MS } from '@/utils/flightKinematics';

const FLIGHT_COLOR = Color.fromCssColorString('#ffa500');
const POLL_MS = FLIGHT_POLL_MS;
const MAX_FLIGHT_TRAIL = 40;
const MAX_FLIGHTS = 2000;
const REMOVAL_TTL_MS = DR_MAX_AGE_MS; // fjern entitet når DR stopper

const MILITARY_COLOR = '#ff2244';

// Skalerer billboard fra 40px (ved 500km høyde) ned til 10px (ved 2000km høyde).
// Cesium interpolerer automatisk basert på kamera-til-entitet-avstand.
const BILLBOARD_SCALE_BY_DISTANCE = new NearFarScalar(500_000, 1.0, 2_000_000, 0.25);

const SOURCE_COLORS: Record<number, string> = {
    0: '#ffa500',
    1: '#00d4ff',
    2: '#ffcc00',
    3: '#00ff88',
};

function getFlightColor(flight: Flight): string {
    if (flight.isMilitary) return MILITARY_COLOR;
    return SOURCE_COLORS[flight.positionSource] ?? '#888888';
}

const planeIconCache = new Map<string, string>();

// Ikonet peker alltid nordover (0°). Heading settes via billboard.rotation + alignedAxis.
function createPlaneIcon(color: string): string {
    const cacheKey = color;
    const cached = planeIconCache.get(cacheKey);
    if (cached) return cached;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
        <g transform="rotate(0, 24, 24)">
            <path d="M24 2 C26 2 28 5 28 10 L28 38 C28 43 26 46 24 46 C22 46 20 43 20 38 L20 10 C20 5 22 2 24 2 Z"
                  fill="${color}" stroke="#000" stroke-width="0.5"/>
            <path d="M20 18 L4 32 L4 35 L20 26 Z"
                  fill="${color}" stroke="#000" stroke-width="0.5"/>
            <path d="M28 18 L44 32 L44 35 L28 26 Z"
                  fill="${color}" stroke="#000" stroke-width="0.5"/>
            <path d="M9 28 C8 28 7 29.5 7 31 C7 32.5 8 34 9 34 L13 34 C14 34 15 32.5 15 31 C15 29.5 14 28 13 28 Z"
                  fill="#222" stroke="#000" stroke-width="0.5"/>
            <path d="M35 28 C34 28 33 29.5 33 31 C33 32.5 34 34 35 34 L39 34 C40 34 41 32.5 41 31 C41 29.5 40 28 39 28 Z"
                  fill="#222" stroke="#000" stroke-width="0.5"/>
            <path d="M20 39 L11 44 L11 46 L20 43 Z"
                  fill="${color}" stroke="#000" stroke-width="0.5"/>
            <path d="M28 39 L37 44 L37 46 L28 43 Z"
                  fill="${color}" stroke="#000" stroke-width="0.5"/>
        </g>
    </svg>`;
    const result = 'data:image/svg+xml,' + encodeURIComponent(svg);
    planeIconCache.set(cacheKey, result);
    return result;
}

// Dead-reckoning state stored per flight
interface DrState {
    lon: number;          // degrees — actual last-known position
    lat: number;          // degrees
    altitude: number;     // meters
    velocity: number;     // m/s
    heading: number;      // degrees from north
    lastUpdateMs: number; // Date.now() at last real API update
}

// Great-circle dead-reckoning — matten bor i utils/flightKinematics (delt med channel-workeren)
function extrapolatePosition(s: DrState, elapsedS: number): Cartesian3 {
    const pos = extrapolateGreatCircle(s.lon, s.lat, s.heading, s.velocity, elapsedS);
    return Cartesian3.fromDegrees(pos.lon, pos.lat, s.altitude);
}

export function FlightLayer() {
    const viewer = useViewer();
    const { cinematicActiveRef } = useCinematic();
    const { setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } = useLayerActions();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const { register: geointRegister, unregister: geointUnregister } = useGeointRegistry();
    const { gates } = useGates();
    const { append: appendTimelineEvents } = useTimelineEventActions();
    const gatesRef = useRef(gates);
    gatesRef.current = gates;
    const appendEventsRef = useRef(appendTimelineEvents);
    appendEventsRef.current = appendTimelineEvents;
    const lastEntityStateRef = useRef<Map<string, EntityPosition>>(new Map());
    const visible = useLayerVisibility('flights');
    const viewport = useViewport(viewer);
    const { mode, modeEpoch } = useTimelineMode();
    const cursor = useReplayCursor(mode);
    const isReplay = mode === 'replay';
    const replayResult = useReplayEntities('flight', cursor);
    const replayEntities = replayResult.entities;
    const lastCursorRef = useRef(cursor);
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const trailDsRef = useRef<CustomDataSource | null>(null);
    const pulseDsRef = useRef<CustomDataSource | null>(null);
    const trailHistoryRef = useRef<Map<string, TrailBuffer<Cartesian3>>>(new Map());
    const firstPollDoneRef = useRef(false);
    const [flights, setFlights] = useState<Flight[]>([]);
    const viewportRef = useRef(viewport);
    viewportRef.current = viewport;
    const flightsRef = useRef<Flight[]>([]);
    flightsRef.current = flights;
    const visibleRef = useRef(visible);
    visibleRef.current = visible;
    // 3D model mode when camera is below 500 km
    const use3DRef = useRef(false);

    // Camera altitude monitor → switch between billboard icons and 3D models,
    // og skjul trails ved zoom-ut (>500km høyde).
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const check = () => {
            if (viewer.isDestroyed()) return;
            const height = viewer.camera.positionCartographic.height;
            use3DRef.current = height < 500_000;
            if (trailDsRef.current) trailDsRef.current.show = height < 500_000 && visibleRef.current;
        };
        check();
        const rm1 = viewer.camera.changed.addEventListener(check);
        const rm2 = viewer.camera.moveEnd.addEventListener(check);
        return () => { rm1(); rm2(); };
    }, [viewer]);

    // Dead-reckoning state map
    const drStateRef = useRef<Map<string, DrState>>(new Map());
    // Sist gang hvert fly ble returnert av API — brukes for soft-removal TTL
    const lastSeenByApiRef = useRef<Map<string, number>>(new Map());
    const fadingIdsRef = useRef<Set<string>>(new Set());
    // Entity-IDs som er clustret i gjeldende frame — brukes for å skjule tilhørende trails
    const clusteredIdsRef = useRef<Set<string>>(new Set());
    // Settes true av clustering-event; postRender hopper over loop hvis false
    const clusterDirtyRef = useRef(false);

    // GEOINT data provider
    useEffect(() => {
        geointRegister('flights', () => {
            if (!visibleRef.current || flightsRef.current.length === 0) return null;
            const flights = flightsRef.current;
            const items = flights.slice(0, 10).map((f) => {
                const altFt = Math.round(f.altitude * 3.28084 / 1000);
                return `${f.callsign || f.icao24}${f.isMilitary ? ' [MILITÆR]' : ''} (${f.originCountry}) hdg ${Math.round(f.heading)}° alt ${altFt}kft`;
            });
            return { layerId: 'flights', label: 'Flytrafikk', count: flights.length, items };
        });
        return () => geointUnregister('flights');
    }, [geointRegister, geointUnregister]);

    // Popup builder
    useEffect(() => {
        register('flights', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const flight = flightsRef.current.find((f) => f.icao24 === entity.id);
            if (!flight) return null;

            const altFt = Math.round(flight.altitude * 3.28084);
            const altKft = Math.round(altFt / 1000);
            const speedKts = Math.round(flight.velocity * 1.94384);
            const callsign = flight.callsign;
            const color = getFlightColor(flight);
            const airline = lookupAirline(callsign ?? '');
            const cachedRoute = callsign ? getCachedRoute(callsign) : undefined;

            const buildDescription = (route?: { origin: string; destination: string }) => {
                const fra = route
                    ? `fra ${route.origin} til ${route.destination}`
                    : 'rute ukjent';
                const vertDesc =
                    flight.verticalRate > 0.5 ? ', stiger' :
                    flight.verticalRate < -0.5 ? ', synker' : '';
                const who = flight.isMilitary
                    ? 'Militærfly'
                    : airline?.name ?? callsign ?? flight.icao24;
                return `${who} flyr ${fra}. ${altKft} 000 fot, ${speedKts} knop${vertDesc}.`;
            };

            const baseFields = [
                { label: 'Høyde', value: altFt.toLocaleString('nb-NO'), unit: 'ft' },
                { label: 'Hastighet', value: speedKts, unit: 'kts' },
                { label: 'Kurs', value: `${Math.round(flight.heading)}°` },
                { label: 'Vertikal', value: flight.verticalRate.toFixed(1), unit: 'm/s' },
                ...(flight.aircraftType ? [{ label: 'Type', value: flight.aircraftType }] : []),
                { label: 'ICAO24', value: flight.icao24 },
            ];

            const routeFields = cachedRoute
                ? [{ label: 'Fra', value: cachedRoute.origin }, { label: 'Til', value: cachedRoute.destination }]
                : [];

            return {
                title: callsign || flight.icao24,
                icon: flight.isMilitary ? '🪖' : '✈',
                color,
                description: buildDescription(cachedRoute ?? undefined),
                imageUrl: airline ? `https://pics.avs.io/200/80/${airline.iataCode}.png` : undefined,
                followEntityId: flight.icao24,
                fields: [...routeFields, ...baseFields],
                enrichAsync: cachedRoute ? undefined : async () => {
                    const route = await fetchFlightRoute(callsign ?? '');
                    if (!route) return {};
                    const newRouteFields = [
                        { label: 'Fra', value: route.origin },
                        { label: 'Til', value: route.destination },
                    ];
                    return {
                        description: buildDescription(route),
                        fields: [...newRouteFields, ...baseFields],
                    };
                },
            };
        });
        return () => unregister('flights');
    }, [register, unregister]);

    // Tooltip builder
    useEffect(() => {
        tooltipRegister('flights', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const flight = flightsRef.current.find((f) => f.icao24 === entity.id);
            if (!flight) return null;
            return {
                title: flight.callsign || flight.icao24,
                subtitle: `${Math.round(flight.altitude * 3.28084).toLocaleString('nb-NO')} ft · ${Math.round(flight.velocity * 1.94384)} kts`,
                icon: flight.isMilitary ? '🪖' : '✈',
                color: getFlightColor(flight),
            };
        });
        return () => tooltipUnregister('flights');
    }, [tooltipRegister, tooltipUnregister]);

    // Polling — paused i replay-modus.
    useEffect(() => {
        if (!visible) return;
        if (isReplay) return;
        let cancelled = false;
        let timerId: ReturnType<typeof setTimeout>;
        const controller = new AbortController();

        const doFetch = async () => {
            setLayerLoading('flights', true);
            try {
                const data = await fetchFlights(viewportRef.current, controller.signal);
                if (!cancelled) {
                    setFlights(data.slice(0, MAX_FLIGHTS));
                    setLayerError('flights', null);
                    setLayerLastUpdated('flights', Date.now());
                }
            } catch (err) {
                if (!cancelled) {
                    setLayerError('flights', err instanceof Error ? err.message : 'Ukjent feil');
                }
            } finally {
                if (!cancelled) {
                    setLayerLoading('flights', false);
                    timerId = setTimeout(doFetch, POLL_MS);
                }
            }
        };

        doFetch();
        return () => { cancelled = true; clearTimeout(timerId); controller.abort(); };
    }, [visible, isReplay, setLayerLoading, setLayerError, setLayerLastUpdated]);

    // Replay-drevet state: når i replay-modus, driv `flights` fra useReplayEntities.
    useEffect(() => {
        if (!isReplay) return;
        // ReplayFlight mangler originCountry — legg til tom for kompatibilitet.
        const adapted: Flight[] = replayEntities.map((f) => ({
            ...f,
            originCountry: '',
            positionSource: f.positionSource as Flight['positionSource'],
        }));
        setFlights(adapted);
        setLayerLastUpdated('flights', cursor);
    }, [isReplay, replayEntities, cursor, setLayerLastUpdated]);

    // Mode-switch og stor cursor-jump: nullstill trails + DR + sist-sett-state.
    useEffect(() => {
        const jumpLarge = Math.abs(cursor - lastCursorRef.current) > CURSOR_JUMP_THRESHOLD_MS;
        lastCursorRef.current = cursor;
        if (!jumpLarge && modeEpoch === 0) return; // første render, intet å rydde.
        trailHistoryRef.current.clear();
        drStateRef.current.clear();
        lastSeenByApiRef.current.clear();
        lastEntityStateRef.current.clear();
        const ds = dataSourceRef.current;
        const trailDs = trailDsRef.current;
        if (ds) ds.entities.removeAll();
        if (trailDs) trailDs.entities.removeAll();
        firstPollDoneRef.current = false;
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [modeEpoch, cursor, viewer]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('flights');
        configureCluster(ds, { pixelRange: 40, minimumClusterSize: 3, color: '#ffa500' });
        viewer.dataSources.add(ds);
        dataSourceRef.current = ds;

        // Samle clustrede entity-IDs per frame; sett dirty-flagg
        const removeClusterListener = ds.clustering.clusterEvent.addEventListener((entities) => {
            for (const e of entities) clusteredIdsRef.current.add(e.id);
            clusterDirtyRef.current = true;
        });

        // Etter render: synkroniser trail-visibility med cluster-state.
        // Early-exit hvis ingen clustering-event ble fyrt siden sist.
        const removePostRender = viewer.scene.postRender.addEventListener(() => {
            if (!clusterDirtyRef.current) return;
            clusterDirtyRef.current = false;
            const trailDs = trailDsRef.current;
            if (!trailDs) return;
            const clustered = clusteredIdsRef.current;
            for (const entity of trailDs.entities.values) {
                const eid = entity.id;
                const planeId = eid.startsWith('trail-tip-')
                    ? eid.slice('trail-tip-'.length)
                    : eid.startsWith('trail-fresh-')
                    ? eid.slice('trail-fresh-'.length)
                    : eid.startsWith('trail-old-')
                    ? eid.slice('trail-old-'.length)
                    : null;
                if (planeId !== null) {
                    const shouldShow = !clustered.has(planeId);
                    if (entity.show !== shouldShow) entity.show = shouldShow;
                }
            }
            clusteredIdsRef.current.clear();
        });

        return () => {
            removeClusterListener();
            removePostRender();
            if (!viewer.isDestroyed()) viewer.dataSources.remove(ds, true);
            dataSourceRef.current = null;
        };
    }, [viewer]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const trailDs = new CustomDataSource('flights-trails');
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
        const pulseDs = new CustomDataSource('flights-pulses');
        viewer.dataSources.add(pulseDs);
        pulseDsRef.current = pulseDs;
        return () => {
            if (!viewer.isDestroyed()) viewer.dataSources.remove(pulseDs, true);
            pulseDsRef.current = null;
        };
    }, [viewer]);

    useEffect(() => {
        if (dataSourceRef.current) dataSourceRef.current.show = visible;
        if (trailDsRef.current) {
            const height = viewer?.camera.positionCartographic.height ?? 0;
            trailDsRef.current.show = visible && height < 500_000;
        }
        if (pulseDsRef.current) pulseDsRef.current.show = visible;
    }, [visible, viewer]);

    // --- Dead-reckoning via setInterval ---
    // 4 Hz er nok: selv raske fly (~300 m/s) flytter seg ~75 m per tick, subpixel
    // på typisk zoom. Dette erstatter den gamle 60 fps rAF-løkken som drev
    // requestRender hvert frame — 93 % færre frames per sekund uten synlig forskjell.
    // Skipped i replay-modus (vi ekstrapolerer ikke gamle posisjoner).
    useEffect(() => {
        if (!visible || !viewer || viewer.isDestroyed()) return;
        if (isReplay) return;
        const intervalId = setInterval(() => {
            if (cinematicActiveRef.current) return;
            const ds = dataSourceRef.current;
            if (!ds?.show) return;
            const nowMs = Date.now();
            let changed = false;
            for (const [id, state] of drStateRef.current) {
                const ageMs = nowMs - state.lastUpdateMs;
                if (ageMs < 100 || ageMs > DR_MAX_AGE_MS) continue;
                const entity = ds.entities.getById(id);
                if (!entity?.position || isSpringAnimating(entity)) continue;
                const extrapolated = extrapolatePosition(state, ageMs / 1000);
                (entity.position as ConstantPositionProperty).setValue(extrapolated);
                changed = true;
            }
            if (changed && !viewer.isDestroyed()) viewer.scene.requestRender();
        }, 250);
        return () => clearInterval(intervalId);
    }, [visible, viewer, isReplay]);

    // Entity sync + DR state update
    const updateEntities = useCallback(() => {
        const ds = dataSourceRef.current;
        const trailDs = trailDsRef.current;
        if (!ds) return;
        setLayerCount('flights', flights.length);
        const existing = new Map<string, Entity>();
        for (const entity of ds.entities.values) existing.set(entity.id, entity);
        const nowMs = Date.now();

        const crossingEvents = [] as ReturnType<typeof detectEntityCrossings>;
        const gatesForDetection = gatesRef.current;
        const detectOptions = { maxStalenessMs: 2 * POLL_MS };

        // Steg 1: oppdater API-sighting og synkroniser entiteter for fly fra denne pollen
        for (const flight of flights) {
            if (flight.onGround) continue;
            const id = flight.icao24;

            // Oppdater tidsstempel for soft-removal TTL
            lastSeenByApiRef.current.set(id, nowMs);

            // Gate-crossing deteksjon (før trail-append og entity-sync — leser forrige rene posisjon).
            if (gatesForDetection.length > 0) {
                const prevState = lastEntityStateRef.current.get(id);
                const currState: EntityPosition = {
                    pos: { lat: flight.lat, lon: flight.lon },
                    ts: nowMs,
                };
                if (prevState) {
                    const events = detectEntityCrossings(
                        id,
                        'flight',
                        prevState,
                        currState,
                        gatesForDetection,
                        detectOptions,
                    );
                    if (events.length > 0) crossingEvents.push(...events);
                }
                lastEntityStateRef.current.set(id, currState);
            }

            const pos = Cartesian3.fromDegrees(flight.lon, flight.lat, flight.altitude);
            const color = getFlightColor(flight);
            const cesiumColor = Color.fromCssColorString(color);

            // Refresh dead-reckoning state with fresh API data
            drStateRef.current.set(id, {
                lon: flight.lon, lat: flight.lat, altitude: flight.altitude,
                velocity: flight.velocity, heading: flight.heading,
                lastUpdateMs: nowMs,
            });

            const entity = existing.get(id);
            const want3D = use3DRef.current;
            if (entity) {
                if (!isSpringAnimating(entity))
                    (entity.position as ConstantPositionProperty).setValue(pos);
                const has3D = !!entity.model;
                if (want3D && !has3D) {
                    // Upgrade to 3D model
                    entity.billboard = undefined;
                    entity.model = new ModelGraphics({
                        uri: getAircraftGltf(classifyAircraftType(flight.aircraftType ?? '', flight.isMilitary)),
                        minimumPixelSize: 18,
                        maximumScale: 60_000,
                        silhouetteColor: cesiumColor,
                        silhouetteSize: 0.5,
                    });
                    entity.orientation = new ConstantProperty(
                        Transforms.headingPitchRollQuaternion(pos, new HeadingPitchRoll(CesiumMath.toRadians(flight.heading - 90), 0, 0))
                    );
                } else if (!want3D && has3D) {
                    // Downgrade to billboard
                    entity.model = undefined;
                    entity.orientation = undefined;
                    entity.billboard = {
                        image: createPlaneIcon(color),
                        width: 40, height: 40, color: cesiumColor,
                        scaleByDistance: BILLBOARD_SCALE_BY_DISTANCE,
                        verticalOrigin: VerticalOrigin.CENTER,
                        horizontalOrigin: HorizontalOrigin.CENTER,
                        heightReference: HeightReference.NONE,
                        rotation: new ConstantProperty(CesiumMath.toRadians(-flight.heading)),
                        alignedAxis: new ConstantProperty(Cartesian3.normalize(pos, new Cartesian3())),
                    } as unknown as import('cesium').BillboardGraphics;
                } else if (want3D) {
                    // Update orientation for 3D model
                    (entity.orientation as ConstantProperty).setValue(
                        Transforms.headingPitchRollQuaternion(pos, new HeadingPitchRoll(CesiumMath.toRadians(flight.heading - 90), 0, 0))
                    );
                } else {
                    // Update billboard
                    if (entity.billboard) {
                        entity.billboard.image = createPlaneIcon(color) as unknown as import('cesium').Property;
                        (entity.billboard.color as ConstantProperty).setValue(cesiumColor);
                        (entity.billboard.rotation as ConstantProperty).setValue(CesiumMath.toRadians(-flight.heading));
                        (entity.billboard.alignedAxis as ConstantProperty).setValue(Cartesian3.normalize(pos, new Cartesian3()));
                    }
                }
            } else {
                const newEntity = want3D
                    ? ds.entities.add(new Entity({
                        id, name: flight.callsign || flight.icao24, position: pos,
                        model: new ModelGraphics({
                            uri: getAircraftGltf(classifyAircraftType(flight.aircraftType ?? '', flight.isMilitary)),
                            minimumPixelSize: 18,
                            maximumScale: 60_000,
                            silhouetteColor: cesiumColor,
                            silhouetteSize: 0.5,
                        }),
                        orientation: new ConstantProperty(
                            Transforms.headingPitchRollQuaternion(pos, new HeadingPitchRoll(CesiumMath.toRadians(flight.heading - 90), 0, 0))
                        ),
                    }))
                    : ds.entities.add(new Entity({
                        id, name: flight.callsign || flight.icao24, position: pos,
                        billboard: {
                            image: createPlaneIcon(color),
                            width: 40, height: 40, color: cesiumColor,
                            scaleByDistance: BILLBOARD_SCALE_BY_DISTANCE,
                            verticalOrigin: VerticalOrigin.CENTER,
                            horizontalOrigin: HorizontalOrigin.CENTER,
                            heightReference: HeightReference.NONE,
                            rotation: new ConstantProperty(CesiumMath.toRadians(-flight.heading)),
                            alignedAxis: new ConstantProperty(Cartesian3.normalize(pos, new Cartesian3())),
                        },
                    }));
                if (viewer) fadeInEntity(newEntity, viewer, 500);
                // Pulsering for nye fly (ikke ved første lasting)
                if (firstPollDoneRef.current && pulseDsRef.current) {
                    spawnPulseRing(pulseDsRef.current, pos, cesiumColor);
                }
            }

            if (trailDs) {
                let history = trailHistoryRef.current.get(id);
                if (!history) {
                    history = new TrailBuffer<Cartesian3>(MAX_FLIGHT_TRAIL);
                    trailHistoryRef.current.set(id, history);
                }
                history.push(pos.clone());

                const trailColor = flight.isMilitary
                    ? Color.fromCssColorString(MILITARY_COLOR)
                    : FLIGHT_COLOR;

                const trailId = `trail-${id}`;
                const positions = history.tail(MAX_FLIGHT_TRAIL);
                const trailEntity = trailDs.entities.getById(trailId);
                if (positions.length >= 2) {
                    if (trailEntity?.polyline?.positions) {
                        (trailEntity.polyline.positions as ConstantProperty).setValue(positions);
                    } else {
                        trailDs.entities.add(new Entity({
                            id: trailId,
                            polyline: {
                                positions: new ConstantProperty(positions),
                                width: 2,
                                material: new PolylineGlowMaterialProperty({ glowPower: 0.15, color: trailColor.withAlpha(0.6) }),
                                clampToGround: false,
                            },
                        }));
                    }
                } else if (trailEntity) {
                    trailDs.entities.removeById(trailId);
                }
            }
        }

        // Marker første poll som ferdig slik at neste poll kan spawne pulseringer
        if (!firstPollDoneRef.current && flights.length > 0) {
            firstPollDoneRef.current = true;
        }

        // Steg 2: bygg keepAlive-set fra alle fly sett innen TTL (inkl. grace period)
        const keepAlive = new Set<string>();
        for (const [id, lastSeen] of lastSeenByApiRef.current) {
            if (nowMs - lastSeen < REMOVAL_TTL_MS) keepAlive.add(id);
        }

        // Steg 3: fjern flyentiteter som har utløpt grace period
        for (const [id] of existing) {
            if (!keepAlive.has(id) && !fadingIdsRef.current.has(id)) {
                // Rydder state umiddelbart slik at DR-løkken slutter å oppdatere entiteten
                drStateRef.current.delete(id);
                lastSeenByApiRef.current.delete(id);
                lastEntityStateRef.current.delete(id);
                const entity = ds.entities.getById(id);
                if (entity && viewer) {
                    fadingIdsRef.current.add(id);
                    fadeOutEntity(entity, viewer, 350, () => {
                        ds.entities.removeById(id);
                        if (trailDs) trailDs.entities.removeById(`trail-${id}`);
                        trailHistoryRef.current.delete(id);
                        fadingIdsRef.current.delete(id);
                    });
                } else {
                    ds.entities.removeById(id);
                    if (trailDs) trailDs.entities.removeById(`trail-${id}`);
                    trailHistoryRef.current.delete(id);
                }
            }
        }

        // Steg 3b: flush innsamlede gate-crossings til timeline + Firestore.
        // Firestore-write er fire-and-forget; feil logges men blokkerer ikke UI.
        if (crossingEvents.length > 0) {
            appendEventsRef.current(crossingEvents);
            void writeCrossings(crossingEvents);
        }

        // Steg 4: sweep etter foreldreløse trail-entiteter (f.eks. fra race conditions ved mount)
        if (trailDs) {
            for (const entity of [...trailDs.entities.values]) {
                const eid = entity.id;
                const planeId = eid.startsWith('trail-') ? eid.slice('trail-'.length) : null;
                if (planeId && !keepAlive.has(planeId)) {
                    trailDs.entities.removeById(eid);
                    trailHistoryRef.current.delete(planeId);
                }
            }
        }

        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [flights, viewer, setLayerCount]);

    useEffect(() => { updateEntities(); }, [updateEntities]);

    return null;
}
