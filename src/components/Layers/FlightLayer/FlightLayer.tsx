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
import { useViewport } from '@/hooks/useViewport';
import { configureCluster } from '@/utils/cluster';
import { fetchFlights, fetchFlightRoute, getCachedRoute, RateLimitError } from '@/services/opensky';
import { type Flight } from '@/types/flight';

const FLIGHT_COLOR = Color.fromCssColorString('#ffa500');
const BASE_POLL_MS = 60_000;
const MAX_FLIGHT_TRAIL = 20;
const MAX_POLL_MS = 5 * 60_000;
const MAX_FLIGHTS = 500;

// Color by position source: ADS-B=orange, ASTERIX=cyan, MLAT=yellow, FLARM=lime, unknown=gray
const SOURCE_COLORS: Record<number, string> = {
    0: '#ffa500', // ADS-B (GPS) — normal
    1: '#00d4ff', // ASTERIX (radar)
    2: '#ffcc00', // MLAT (multilateration — potential GPS jamming zone)
    3: '#00ff88', // FLARM (collision avoidance)
};
const SOURCE_LABELS: Record<number, string> = {
    0: 'ADS-B (GPS)',
    1: 'ASTERIX (radar)',
    2: 'MLAT (multilateration)',
    3: 'FLARM',
};

function getSourceColor(src: number): string {
    return SOURCE_COLORS[src] ?? '#888888';
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

export function FlightLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
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
    const routePendingRef = useRef(new Set<string>());

    // Register popup builder
    useEffect(() => {
        register('flights', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const flight = flightsRef.current.find((f) => f.icao24 === entity.id);
            if (!flight) return null;
            const altFt = Math.round(flight.altitude * 3.28084);
            const speedKts = Math.round(flight.velocity * 1.94384);

            const callsign = flight.callsign;
            const cachedRoute = callsign ? getCachedRoute(callsign) : undefined;

            // Trigger async fetch if not yet cached
            if (callsign && cachedRoute === undefined && !routePendingRef.current.has(callsign)) {
                routePendingRef.current.add(callsign);
                fetchFlightRoute(callsign).then(() => {
                    // Re-trigger popup if this flight is still selected
                    if (viewer?.selectedEntity?.id === flight.icao24) {
                        const selected = viewer.selectedEntity;
                        viewer.selectedEntity = undefined;
                        setTimeout(() => { viewer.selectedEntity = selected; }, 0);
                    }
                });
            }

            const sourceColor = getSourceColor(flight.positionSource);
            return {
                title: flight.callsign || flight.icao24,
                icon: '✈',
                color: sourceColor,
                followEntityId: flight.icao24,
                fields: [
                    ...(cachedRoute ? [
                        { label: 'Fra', value: cachedRoute.origin },
                        { label: 'Til', value: cachedRoute.destination },
                    ] : []),
                    { label: 'ICAO24', value: flight.icao24 },
                    { label: 'Land', value: flight.originCountry },
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

    // Register tooltip builder
    useEffect(() => {
        tooltipRegister('flights', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const flight = flightsRef.current.find((f) => f.icao24 === entity.id);
            if (!flight) return null;
            return {
                title: flight.callsign || flight.icao24,
                subtitle: `${Math.round(flight.altitude * 3.28084).toLocaleString('nb-NO')} ft · ${Math.round(flight.velocity * 1.94384)} kts`,
                icon: '✈',
                color: getSourceColor(flight.positionSource),
            };
        });
        return () => tooltipUnregister('flights');
    }, [tooltipRegister, tooltipUnregister]);

    // Polling with exponential backoff on rate limit
    useEffect(() => {
        if (!visible) return;
        let cancelled = false;
        let pollMs = BASE_POLL_MS;
        let timerId: ReturnType<typeof setTimeout>;

        const doFetch = async () => {
            setLayerLoading('flights', true);
            try {
                const data = await fetchFlights(viewportRef.current);
                if (!cancelled) {
                    setFlights(data.slice(0, MAX_FLIGHTS));
                    setLayerError('flights', null);
                    setLayerLastUpdated('flights', Date.now());
                    pollMs = BASE_POLL_MS; // Reset on success
                }
            } catch (err) {
                if (!cancelled) {
                    setLayerError('flights', err instanceof Error ? err.message : 'Ukjent feil');
                }
                if (err instanceof RateLimitError) {
                    pollMs = Math.min(pollMs * 2, MAX_POLL_MS);
                    console.warn(`[FlightLayer] rate limit, backing off to ${pollMs / 1000}s`);
                }
            } finally {
                if (!cancelled) {
                    setLayerLoading('flights', false);
                    timerId = setTimeout(doFetch, pollMs);
                }
            }
        };

        doFetch();
        return () => { cancelled = true; clearTimeout(timerId); };
    }, [visible, setLayerLoading]);

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
        return () => {
            if (!viewer.isDestroyed()) viewer.dataSources.remove(trailDs, true);
            trailDsRef.current = null;
            trailHistoryRef.current.clear();
        };
    }, [viewer]);

    useEffect(() => {
        if (dataSourceRef.current) dataSourceRef.current.show = visible;
        if (trailDsRef.current) trailDsRef.current.show = visible;
    }, [visible]);

    const updateEntities = useCallback(() => {
        const ds = dataSourceRef.current;
        const trailDs = trailDsRef.current;
        if (!ds) return;
        setLayerCount('flights', flights.length);
        const existing = new Map<string, Entity>();
        for (const entity of ds.entities.values) existing.set(entity.id, entity);
        const seen = new Set<string>();
        for (const flight of flights) {
            if (flight.onGround) continue;
            const id = flight.icao24;
            seen.add(id);
            const pos = Cartesian3.fromDegrees(flight.lon, flight.lat, flight.altitude);
            const srcColor = getSourceColor(flight.positionSource);
            const cesiumColor = Color.fromCssColorString(srcColor);
            const entity = existing.get(id);
            if (entity) {
                (entity.position as ConstantPositionProperty).setValue(pos);
                if (entity.billboard) {
                    entity.billboard.image = createPlaneIcon(flight.heading, srcColor) as unknown as import('cesium').Property;
                    (entity.billboard.color as ConstantProperty).setValue(cesiumColor);
                }
            } else {
                ds.entities.add(new Entity({
                    id, name: flight.callsign || flight.icao24, position: pos,
                    billboard: {
                        image: createPlaneIcon(flight.heading, srcColor),
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
                                color: FLIGHT_COLOR.withAlpha(0.7),
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
            }
        }
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [flights, viewer, setLayerCount]);

    useEffect(() => { updateEntities(); }, [updateEntities]);

    return null;
}
