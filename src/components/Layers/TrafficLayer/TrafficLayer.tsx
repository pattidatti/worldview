import { useEffect, useRef, useCallback, useState } from 'react';
import {
    CustomDataSource,
    Entity,
    Cartesian3,
    Color,
    PointGraphics,
    ConstantPositionProperty,
    ConstantProperty,
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { useViewport } from '@/hooks/useViewport';
import { syncEntities } from '@/utils/syncEntities';
import { fetchTrafficEvents } from '@/services/tomtom-traffic';
import { type TrafficEvent } from '@/types/traffic';

const SEVERITY_COLORS = {
    low: Color.fromCssColorString('#00cc44'),
    medium: Color.fromCssColorString('#ffcc00'),
    high: Color.fromCssColorString('#ff3333'),
};
const POLL_MS = 2 * 60 * 1000;

export function TrafficLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const visible = isVisible('traffic');
    const viewport = useViewport(viewer);
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const eventsRef = useRef<TrafficEvent[]>([]);

    const [events, setEvents] = useState<TrafficEvent[] | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!visible || !viewport) return;

        const controller = new AbortController();
        let cancelled = false;

        const doFetch = async () => {
            setLoading(true);
            try {
                const result = await fetchTrafficEvents(viewport, controller.signal);
                if (!cancelled) {
                    setEvents(result);
                    setLayerError('traffic', null);
                    setLayerLastUpdated('traffic', Date.now());
                }
            } catch (err) {
                if (!cancelled && !(err instanceof DOMException && err.name === 'AbortError')) {
                    if (import.meta.env.DEV) console.error('[TrafficLayer] fetch error:', err);
                    setLayerError('traffic', err instanceof Error ? err.message : 'Ukjent feil');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        doFetch();
        const intervalId = setInterval(doFetch, POLL_MS);

        return () => {
            cancelled = true;
            controller.abort();
            clearInterval(intervalId);
        };
    }, [visible, viewport, setLayerError, setLayerLastUpdated]);

    if (events) eventsRef.current = events;

    // Register popup builder
    useEffect(() => {
        register('traffic', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const event = eventsRef.current.find((e) => e.id === entity.id);
            if (!event) return null;
            const severityLabel = { low: 'Lav', medium: 'Middels', high: 'Høy' };
            return {
                title: event.type,
                icon: event.severity === 'high' ? '🚨' : event.severity === 'medium' ? '⚠️' : '🚗',
                color: event.severity === 'high' ? '#ff3333' : event.severity === 'medium' ? '#ffcc00' : '#00cc44',
                fields: [
                    { label: 'Beskrivelse', value: event.description },
                    { label: 'Alvorlighet', value: severityLabel[event.severity] },
                    ...(event.roadNumber ? [{ label: 'Veg', value: event.roadNumber }] : []),
                    ...(event.startTime
                        ? [{ label: 'Startet', value: new Date(event.startTime).toLocaleString('nb-NO') }]
                        : []),
                    ...(event.endTime
                        ? [{ label: 'Forventet slutt', value: new Date(event.endTime).toLocaleString('nb-NO') }]
                        : []),
                ],
            };
        });
        return () => unregister('traffic');
    }, [register, unregister]);

    // Register tooltip builder
    useEffect(() => {
        tooltipRegister('traffic', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const event = eventsRef.current.find((e) => e.id === entity.id);
            if (!event) return null;
            const severityLabel = { low: 'Lav', medium: 'Middels', high: 'Høy' };
            return {
                title: event.type,
                subtitle: `${severityLabel[event.severity]}${event.roadNumber ? ` · ${event.roadNumber}` : ''}`,
                icon: event.severity === 'high' ? '🚨' : event.severity === 'medium' ? '⚠️' : '🚗',
                color: event.severity === 'high' ? '#ff3333' : event.severity === 'medium' ? '#ffcc00' : '#00cc44',
            };
        });
        return () => tooltipUnregister('traffic');
    }, [tooltipRegister, tooltipUnregister]);

    useEffect(() => { setLayerLoading('traffic', loading); }, [loading, setLayerLoading]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('traffic');
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
        if (!ds || !events) return;
        setLayerCount('traffic', events.length);
        syncEntities({
            ds,
            items: events,
            getId: (ev) => ev.id,
            onUpdate: (entity, ev) => {
                const pos = Cartesian3.fromDegrees(ev.lon, ev.lat, 0);
                const color = SEVERITY_COLORS[ev.severity];
                (entity.position as ConstantPositionProperty).setValue(pos);
                if (entity.point?.color) (entity.point.color as ConstantProperty).setValue(color);
            },
            onCreate: (ev) => new Entity({
                id: ev.id,
                name: ev.type,
                position: Cartesian3.fromDegrees(ev.lon, ev.lat, 0),
                point: new PointGraphics({
                    pixelSize: 7,
                    color: SEVERITY_COLORS[ev.severity],
                    outlineColor: Color.BLACK,
                    outlineWidth: 1,
                }),
            }),
            viewer,
        });
    }, [events, viewer, setLayerCount]);

    useEffect(() => { updateEntities(); }, [updateEntities]);

    return null;
}
