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
import { usePollingData } from '@/hooks/usePollingData';
import { fetchTrafficEvents } from '@/services/vegvesen-traffic';
import { type PopupContent } from '@/types/popup';

const SEVERITY_COLORS = {
    low: Color.fromCssColorString('#00cc44'),
    medium: Color.fromCssColorString('#ffcc00'),
    high: Color.fromCssColorString('#ff3333'),
};

const POLL_MS = 2 * 60 * 1000; // 2 min

interface TrafficLayerProps {
    onSelect: (popup: PopupContent | null) => void;
}

export function TrafficLayer({ onSelect }: TrafficLayerProps) {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount } = useLayers();
    const visible = isVisible('traffic');
    const dataSourceRef = useRef<CustomDataSource | null>(null);

    const { data: events, loading } = usePollingData(fetchTrafficEvents, POLL_MS, visible);

    useEffect(() => {
        setLayerLoading('traffic', loading);
    }, [loading, setLayerLoading]);

    // Create/remove data source
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;

        const ds = new CustomDataSource('traffic');
        viewer.dataSources.add(ds);
        dataSourceRef.current = ds;

        return () => {
            if (!viewer.isDestroyed()) {
                viewer.dataSources.remove(ds, true);
            }
            dataSourceRef.current = null;
        };
    }, [viewer]);

    // Toggle visibility
    useEffect(() => {
        if (dataSourceRef.current) {
            dataSourceRef.current.show = visible;
        }
    }, [visible]);

    // Update entities
    const updateEntities = useCallback(() => {
        const ds = dataSourceRef.current;
        if (!ds || !events) return;

        setLayerCount('traffic', events.length);
        ds.entities.removeAll();

        for (const event of events) {
            const color = SEVERITY_COLORS[event.severity];
            ds.entities.add(
                new Entity({
                    id: event.id,
                    name: event.type,
                    position: Cartesian3.fromDegrees(event.lon, event.lat, 0),
                    point: new PointGraphics({
                        pixelSize: 7,
                        color,
                        outlineColor: Color.BLACK,
                        outlineWidth: 1,
                    }),
                })
            );
        }
    }, [events, setLayerCount]);

    useEffect(() => {
        updateEntities();
    }, [updateEntities]);

    // Handle clicks
    useEffect(() => {
        if (!viewer || viewer.isDestroyed() || !events) return;

        const handler = viewer.selectedEntityChanged.addEventListener((entity: Entity | undefined) => {
            if (!entity || !dataSourceRef.current?.entities.contains(entity)) {
                return;
            }

            const event = events.find((e) => e.id === entity.id);
            if (!event) return;

            const severityLabel = { low: 'Lav', medium: 'Middels', high: 'Høy' };

            onSelect({
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
            });
        });

        return () => {
            handler();
        };
    }, [viewer, events, onSelect]);

    return null;
}
