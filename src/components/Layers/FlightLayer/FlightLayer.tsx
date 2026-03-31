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
import { type Flight } from '@/types/flight';

const FLIGHT_COLOR = Color.fromCssColorString('#ffa500');
const POLL_MS = 15_000;
const MAX_FLIGHT_TRAIL = 20;
const MAX_FLIGHTS = 2000;
const DR_MAX_AGE_MS = POLL_MS * 2; // stop extrapolating after 2 missed polls
const EARTH_RADIUS_M = 6_371_000;

const MILITARY_COLOR = '#ff2244';

const SOURCE_COLORS: Record<number, string> = {
    0: '#ffa500',
    1: '#00d4ff',
    2: '#ffcc00',
    3: '#00ff88',
};
const SOURCE_LABELS: Record<number, string> = {
    0: 'ADS-B (GPS)',
    1: 'ASTERIX (radar)',
    2: 'MLAT (multilateration)',
    3: 'FLARM',
};

function getFlightColor(flight: Flight): string {
    if (flight.isMilitary) return MILITARY_COLOR;
    return SOURCE_COLORS[flight.positionSource] ?? '#888888';
}

const planeIconCache = new Map<string, string>();

function createPlaneIcon(heading: number, color: string): string {
    const h = Math.round(heading);
    const cacheKey = `${h}-${color}`;
    const cached = planeIconCache.get(cacheKey);
    if (cached) return cached;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
        <g transform="rotate(${h}, 12, 12)">
            <path d="M12 2 L14 9 L21 11 L14 13 L14 20 L12 18 L10 20 L10 13 L3 11 L10 9 Z"
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
    const trailHistoryRef = useRef<Map<string, Cartesian3[]>>(new Map());
    const [flights, setFlights] = useState<Flight[]>([]);
    const viewportRef = useRef(viewport);
    viewportRef.current = viewport;
    const flightsRef = useRef<Flight[]>([]);
    flightsRef.current = flights;
    const visibleRef = useRef(visible);
    visibleRef.current = visible;
    const routePendingRef = useRef(new Set<string>());
    // Dead-reckoning state map
    const drStateRef = useRef<Map<string, DrState>>(new Map());

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
            const speedKts = Math.round(flight.velocity * 1.94384);
            const callsign = flight.callsign;
            const cachedRoute = callsign ? getCachedRoute(callsign) : undefined;

            if (callsign && cachedRoute === undefined && !routePendingRef.current.has(callsign)) {
                routePendingRef.current.add(callsign);
                fetchFlightRoute(callsign).then(() => {
                    if (viewer?.selectedEntity?.id === flight.icao24) {
                        const selected = viewer.selectedEntity;
                        viewer.selectedEntity = undefined;
                        setTimeout(() => { viewer.selectedEntity = selected; }, 0);
                    }
                });
            }

            const color = getFlightColor(flight);
            return {
                title: flight.callsign || flight.icao24,
                icon: flight.isMilitary ? '🪖' : '✈',
                color,
                followEntityId: flight.icao24,
                fields: [
                    ...(flight.isMilitary ? [{ label: 'Type', value: 'Militærfly' }] : []),
                    ...(cachedRoute ? [
                        { label: 'Fra', value: cachedRoute.origin },
                        { label: 'Til', value: cachedRoute.destination },
                    ] : []),
                    { label: 'ICAO24', value: flight.icao24 },
                    ...(flight.originCountry ? [{ label: 'Land', value: flight.originCountry }] : []),
                    { label: 'Høyde', value: altFt.toLocaleString('nb-NO'), unit: 'ft' },
                    { label: 'Hastighet', value: speedKts, unit: 'kts' },
                    { label: 'Kurs', value: `${Math.round(flight.heading)}°` },
                    { label: 'Vertikal', value: flight.verticalRate.toFixed(1), unit: 'm/s' },
                    { label: 'Posisjonskilde', value: SOURCE_LABELS[flight.positionSource] ?? 'Ukjent' },
                ],
            };
        });
        return () => unregister('flights');
    }, [register, unregister, viewer]);

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
        if (dataSourceRef.current) dataSourceRef.current.show = visible;
        if (trailDsRef.current) trailDsRef.current.show = visible;
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
        const seen = new Set<string>();
        const nowMs = Date.now();

        for (const flight of flights) {
            if (flight.onGround) continue;
            const id = flight.icao24;
            seen.add(id);
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
                    entity.billboard.image = createPlaneIcon(flight.heading, color) as unknown as import('cesium').Property;
                    (entity.billboard.color as ConstantProperty).setValue(cesiumColor);
                }
            } else {
                ds.entities.add(new Entity({
                    id, name: flight.callsign || flight.icao24, position: pos,
                    billboard: {
                        image: createPlaneIcon(flight.heading, color),
                        width: 20, height: 20, color: cesiumColor,
                        verticalOrigin: VerticalOrigin.CENTER,
                        horizontalOrigin: HorizontalOrigin.CENTER,
                        heightReference: HeightReference.NONE, rotation: 0,
                    },
                }));
            }

            if (trailDs) {
                const history = trailHistoryRef.current.get(id) ?? [];
                history.push(pos.clone());
                if (history.length > MAX_FLIGHT_TRAIL) history.shift();
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
                                color: flight.isMilitary
                                    ? Color.fromCssColorString(MILITARY_COLOR).withAlpha(0.7)
                                    : FLIGHT_COLOR.withAlpha(0.7),
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
                if (trailDs) trailDs.entities.removeById(`trail-${id}`);
                trailHistoryRef.current.delete(id);
                drStateRef.current.delete(id);
            }
        }
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [flights, viewer, setLayerCount]);

    useEffect(() => { updateEntities(); }, [updateEntities]);

    return null;
}
