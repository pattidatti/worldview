import { useEffect, useRef, useCallback } from 'react';
import {
    CustomDataSource,
    Entity,
    Cartesian3,
    Color,
    PointGraphics,
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { usePollingData } from '@/hooks/usePollingData';
import { fetchTrafficEvents } from '@/services/vegvesen-traffic';
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
    const visible = isVisible('traffic');
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const eventsRef = useRef<TrafficEvent[]>([]);

    const { data: events, loading, error, lastUpdated } = usePollingData(fetchTrafficEvents, POLL_MS, visible);
    if (events) eventsRef.current = events;

    useEffect(() => { setLayerError('traffic', error); }, [error, setLayerError]);
    useEffect(() => { setLayerLastUpdated('traffic', lastUpdated); }, [lastUpdated, setLayerLastUpdated]);

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
                ],
            };
        });
        return () => unregister('traffic');
    }, [register, unregister]);

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
        ds.entities.removeAll();
        for (const event of events) {
            ds.entities.add(new Entity({
                id: event.id, name: event.type,
                position: Cartesian3.fromDegrees(event.lon, event.lat, 0),
                point: new PointGraphics({
                    pixelSize: 7, color: SEVERITY_COLORS[event.severity],
                    outlineColor: Color.BLACK, outlineWidth: 1,
                }),
            }));
        }
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [events, viewer, setLayerCount]);

    useEffect(() => { updateEntities(); }, [updateEntities]);

    return null;
}
