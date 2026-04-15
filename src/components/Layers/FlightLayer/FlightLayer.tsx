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
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { useGeointRegistry } from '@/context/GeointContext';
import { useViewport } from '@/hooks/useViewport';
import { configureCluster } from '@/utils/cluster';
import { fetchFlights } from '@/services/airplaneslive';
import { fetchFlightRoute, getCachedRoute } from '@/services/opensky';
import { lookupAirline } from '@/data/airlines';
import { spawnPulseRing } from '@/utils/pulseRing';
import { type Flight } from '@/types/flight';

const FLIGHT_COLOR = Color.fromCssColorString('#ffa500');
const POLL_MS = 10_000;
const MAX_FLIGHT_TRAIL = 40;
const MAX_FLIGHTS = 2000;
const DR_MAX_AGE_MS = POLL_MS * 3;    // stopp ekstrapolering etter 3 missede polls (30s)
const REMOVAL_TTL_MS = DR_MAX_AGE_MS; // fjern entitet når DR stopper
const EARTH_RADIUS_M = 6_371_000;

const MILITARY_COLOR = '#ff2244';

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

// Great-circle dead-reckoning: project (lon,lat) forward by (velocity × elapsed)
function extrapolatePosition(s: DrState, elapsedS: number): Cartesian3 {
    const headingRad = (s.heading * Math.PI) / 180;
    const distM = s.velocity * elapsedS;
    const latRad = (s.lat * Math.PI) / 180;
    const dLatRad = (distM * Math.cos(headingRad)) / EARTH_RADIUS_M;
    const dLonRad = (distM * Math.sin(headingRad)) / (EARTH_RADIUS_M * Math.cos(latRad));
    return Cartesian3.fromDegrees(
        s.lon + dLonRad * (180 / Math.PI),
        s.lat + dLatRad * (180 / Math.PI),
        s.altitude,
    );
}

export function FlightLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const { register: geointRegister, unregister: geointUnregister } = useGeointRegistry();
    const visible = isVisible('flights');
    const viewport = useViewport(viewer);
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const trailDsRef = useRef<CustomDataSource | null>(null);
    const pulseDsRef = useRef<CustomDataSource | null>(null);
    const trailHistoryRef = useRef<Map<string, Cartesian3[]>>(new Map());
    const firstPollDoneRef = useRef(false);
    const [flights, setFlights] = useState<Flight[]>([]);
    const viewportRef = useRef(viewport);
    viewportRef.current = viewport;
    const flightsRef = useRef<Flight[]>([]);
    flightsRef.current = flights;
    const visibleRef = useRef(visible);
    visibleRef.current = visible;
    // Dead-reckoning state map
    const drStateRef = useRef<Map<string, DrState>>(new Map());
    // Sist gang hvert fly ble returnert av API — brukes for soft-removal TTL
    const lastSeenByApiRef = useRef<Map<string, number>>(new Map());

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

    // Polling
    useEffect(() => {
        if (!visible) return;
        let cancelled = false;
        let timerId: ReturnType<typeof setTimeout>;

        const doFetch = async () => {
            setLayerLoading('flights', true);
            try {
                const data = await fetchFlights(viewportRef.current);
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
        return () => { cancelled = true; clearTimeout(timerId); };
    }, [visible, setLayerLoading, setLayerError, setLayerLastUpdated]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('flights');
        configureCluster(ds, { pixelRange: 40, minimumClusterSize: 3, color: '#ffa500' });
        viewer.dataSources.add(ds);
        dataSourceRef.current = ds;
        return () => {
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
        if (trailDsRef.current) trailDsRef.current.show = visible;
        if (pulseDsRef.current) pulseDsRef.current.show = visible;
    }, [visible]);

    // --- Dead-reckoning: preRender listener ---
    // Each frame: extrapolate every airborne flight forward from its last known position.
    // We only extrapolate up to DR_MAX_AGE_MS to avoid runaway drift on stale data.
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const handle = viewer.scene.preRender.addEventListener(() => {
            const ds = dataSourceRef.current;
            if (!ds?.show) return;
            const nowMs = Date.now();
            for (const [id, state] of drStateRef.current) {
                const ageMs = nowMs - state.lastUpdateMs;
                if (ageMs < 100 || ageMs > DR_MAX_AGE_MS) continue; // skip brand-new or stale
                const entity = ds.entities.getById(id);
                if (!entity?.position) continue;
                const extrapolated = extrapolatePosition(state, ageMs / 1000);
                (entity.position as ConstantPositionProperty).setValue(extrapolated);
            }
        });
        return () => handle();
    }, [viewer]);

    // --- rAF loop: drives rendering at ~60fps while flights are visible ---
    // This is what makes dead-reckoning actually smooth — requestRenderMode
    // won't re-render unless asked, so we ask every animation frame.
    useEffect(() => {
        if (!visible || !viewer) return;
        let rafId: number;
        const tick = () => {
            if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafId);
    }, [visible, viewer]);

    // Entity sync + DR state update
    const updateEntities = useCallback(() => {
        const ds = dataSourceRef.current;
        const trailDs = trailDsRef.current;
        if (!ds) return;
        setLayerCount('flights', flights.length);
        const existing = new Map<string, Entity>();
        for (const entity of ds.entities.values) existing.set(entity.id, entity);
        const nowMs = Date.now();

        // Steg 1: oppdater API-sighting og synkroniser entiteter for fly fra denne pollen
        for (const flight of flights) {
            if (flight.onGround) continue;
            const id = flight.icao24;

            // Oppdater tidsstempel for soft-removal TTL
            lastSeenByApiRef.current.set(id, nowMs);

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
            if (entity) {
                (entity.position as ConstantPositionProperty).setValue(pos);
                if (entity.billboard) {
                    entity.billboard.image = createPlaneIcon(color) as unknown as import('cesium').Property;
                    (entity.billboard.color as ConstantProperty).setValue(cesiumColor);
                    (entity.billboard.rotation as ConstantProperty).setValue(
                        CesiumMath.toRadians(-flight.heading)
                    );
                }
            } else {
                ds.entities.add(new Entity({
                    id, name: flight.callsign || flight.icao24, position: pos,
                    billboard: {
                        image: createPlaneIcon(color),
                        width: 40, height: 40, color: cesiumColor,
                        verticalOrigin: VerticalOrigin.CENTER,
                        horizontalOrigin: HorizontalOrigin.CENTER,
                        heightReference: HeightReference.NONE,
                        rotation: new ConstantProperty(CesiumMath.toRadians(-flight.heading)),
                        alignedAxis: new ConstantProperty(Cartesian3.UNIT_Z),
                    },
                }));
                // Pulsering for nye fly (ikke ved første lasting)
                if (firstPollDoneRef.current && pulseDsRef.current) {
                    spawnPulseRing(pulseDsRef.current, pos, cesiumColor);
                }
            }

            if (trailDs) {
                const history = trailHistoryRef.current.get(id) ?? [];
                history.push(pos.clone());
                if (history.length > MAX_FLIGHT_TRAIL) history.shift();
                trailHistoryRef.current.set(id, history);

                const trailColor = flight.isMilitary
                    ? Color.fromCssColorString(MILITARY_COLOR)
                    : FLIGHT_COLOR;

                // Fersk hale: siste 8 posisjoner — lys og tydelig
                const freshId = `trail-fresh-${id}`;
                const fresh = history.slice(-8);
                const freshEntity = trailDs.entities.getById(freshId);
                if (freshEntity?.polyline?.positions) {
                    (freshEntity.polyline.positions as ConstantProperty).setValue([...fresh]);
                } else if (fresh.length >= 2) {
                    trailDs.entities.add(new Entity({
                        id: freshId,
                        polyline: {
                            positions: new ConstantProperty([...fresh]),
                            width: 2.5,
                            material: new PolylineGlowMaterialProperty({
                                glowPower: 0.4,
                                color: trailColor.withAlpha(0.9),
                            }),
                            clampToGround: false,
                        },
                    }));
                }

                // Gammel hale: resten — mørk og diskret
                const oldId = `trail-old-${id}`;
                const old = history.slice(0, -8);
                const oldEntity = trailDs.entities.getById(oldId);
                if (old.length >= 2) {
                    if (oldEntity?.polyline?.positions) {
                        (oldEntity.polyline.positions as ConstantProperty).setValue([...old]);
                    } else {
                        trailDs.entities.add(new Entity({
                            id: oldId,
                            polyline: {
                                positions: new ConstantProperty([...old]),
                                width: 1,
                                material: new PolylineGlowMaterialProperty({
                                    glowPower: 0.1,
                                    color: trailColor.withAlpha(0.25),
                                }),
                                clampToGround: false,
                            },
                        }));
                    }
                } else if (oldEntity) {
                    trailDs.entities.removeById(oldId);
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
            if (!keepAlive.has(id)) {
                ds.entities.removeById(id);
                if (trailDs) {
                    trailDs.entities.removeById(`trail-fresh-${id}`);
                    trailDs.entities.removeById(`trail-old-${id}`);
                }
                trailHistoryRef.current.delete(id);
                drStateRef.current.delete(id);
                lastSeenByApiRef.current.delete(id);
            }
        }

        // Steg 4: sweep etter foreldreløse trail-entiteter (f.eks. fra race conditions ved mount)
        if (trailDs) {
            for (const entity of [...trailDs.entities.values]) {
                const eid = entity.id;
                const planeId = eid.startsWith('trail-fresh-')
                    ? eid.slice('trail-fresh-'.length)
                    : eid.startsWith('trail-old-')
                    ? eid.slice('trail-old-'.length)
                    : null;
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
