import { useEffect, useRef, useCallback, useState } from 'react';
import {
    CustomDataSource,
    Entity,
    Cartesian3,
    Color,
    ConstantPositionProperty,
    HeightReference,
    VerticalOrigin,
    HorizontalOrigin,
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useViewport } from '@/hooks/useViewport';
import { fetchFlights } from '@/services/opensky';
import { type Flight } from '@/types/flight';

const FLIGHT_COLOR = Color.fromCssColorString('#ffa500');
const POLL_MS = 15_000;
const MAX_FLIGHTS = 500;

function createPlaneIcon(heading: number): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
        <g transform="rotate(${heading}, 12, 12)">
            <path d="M12 2 L14 9 L21 11 L14 13 L14 20 L12 18 L10 20 L10 13 L3 11 L10 9 Z"
                  fill="#ffa500" stroke="#000" stroke-width="0.5"/>
        </g>
    </svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

export function FlightLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const visible = isVisible('flights');
    const viewport = useViewport(viewer);
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const [flights, setFlights] = useState<Flight[]>([]);
    const viewportRef = useRef(viewport);
    viewportRef.current = viewport;
    const flightsRef = useRef<Flight[]>([]);
    flightsRef.current = flights;

    // Register popup builder
    useEffect(() => {
        register('flights', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const flight = flightsRef.current.find((f) => f.icao24 === entity.id);
            if (!flight) return null;
            const altFt = Math.round(flight.altitude * 3.28084);
            const speedKts = Math.round(flight.velocity * 1.94384);
            return {
                title: flight.callsign || flight.icao24,
                icon: '✈',
                color: '#ffa500',
                fields: [
                    { label: 'ICAO24', value: flight.icao24 },
                    { label: 'Land', value: flight.originCountry },
                    { label: 'Høyde', value: altFt.toLocaleString('nb-NO'), unit: 'ft' },
                    { label: 'Hastighet', value: speedKts, unit: 'kts' },
                    { label: 'Kurs', value: `${Math.round(flight.heading)}°` },
                    { label: 'Vertikal', value: flight.verticalRate.toFixed(1), unit: 'm/s' },
                ],
            };
        });
        return () => unregister('flights');
    }, [register, unregister]);

    useEffect(() => {
        if (!visible) return;
        let cancelled = false;
        const doFetch = async () => {
            setLayerLoading('flights', true);
            try {
                const data = await fetchFlights(viewportRef.current);
                console.log('[FlightLayer] fetched', data.length, 'flights');
                if (!cancelled) setFlights(data.slice(0, MAX_FLIGHTS));
            } catch (err) { console.error('[FlightLayer] fetch error:', err); }
            finally { if (!cancelled) setLayerLoading('flights', false); }
        };
        doFetch();
        const id = setInterval(doFetch, POLL_MS);
        return () => { cancelled = true; clearInterval(id); };
    }, [visible, setLayerLoading]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('flights');
        viewer.dataSources.add(ds);
        dataSourceRef.current = ds;
        return () => {
            if (!viewer.isDestroyed()) viewer.dataSources.remove(ds, true);
            dataSourceRef.current = null;
        };
    }, [viewer]);

    useEffect(() => {
        if (dataSourceRef.current) dataSourceRef.current.show = visible;
    }, [visible]);

    const updateEntities = useCallback(() => {
        const ds = dataSourceRef.current;
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
            const entity = existing.get(id);
            if (entity) {
                (entity.position as ConstantPositionProperty).setValue(pos);
                if (entity.billboard) {
                    entity.billboard.image = createPlaneIcon(flight.heading) as unknown as import('cesium').Property;
                }
            } else {
                ds.entities.add(new Entity({
                    id, name: flight.callsign || flight.icao24, position: pos,
                    billboard: {
                        image: createPlaneIcon(flight.heading),
                        width: 20, height: 20, color: FLIGHT_COLOR,
                        verticalOrigin: VerticalOrigin.CENTER,
                        horizontalOrigin: HorizontalOrigin.CENTER,
                        heightReference: HeightReference.NONE, rotation: 0,
                    },
                }));
            }
        }
        for (const [id] of existing) { if (!seen.has(id)) ds.entities.removeById(id); }
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [flights, viewer, setLayerCount]);

    useEffect(() => { updateEntities(); }, [updateEntities]);

    return null;
}
