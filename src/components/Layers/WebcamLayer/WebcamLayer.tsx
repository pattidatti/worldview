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
import { fetchWebcams } from '@/services/vegvesen-webcam';
import { type PopupContent } from '@/types/popup';

const WEBCAM_COLOR = Color.fromCssColorString('#ff4444');
const POLL_MS = 5 * 60 * 1000; // 5 min

interface WebcamLayerProps {
    onSelect: (popup: PopupContent | null) => void;
}

export function WebcamLayer({ onSelect }: WebcamLayerProps) {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount } = useLayers();
    const visible = isVisible('webcams');
    const dataSourceRef = useRef<CustomDataSource | null>(null);

    const { data: webcams, loading } = usePollingData(fetchWebcams, POLL_MS, visible);

    useEffect(() => {
        setLayerLoading('webcams', loading);
    }, [loading, setLayerLoading]);

    // Create/remove data source
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;

        const ds = new CustomDataSource('webcams');
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
        if (!ds || !webcams) return;

        setLayerCount('webcams', webcams.length);
        ds.entities.removeAll();

        for (const cam of webcams) {
            ds.entities.add(
                new Entity({
                    id: cam.id,
                    name: cam.name,
                    position: Cartesian3.fromDegrees(cam.lon, cam.lat, 0),
                    point: new PointGraphics({
                        pixelSize: 6,
                        color: WEBCAM_COLOR,
                        outlineColor: Color.fromCssColorString('#ff444466'),
                        outlineWidth: 2,
                    }),
                })
            );
        }
    }, [webcams, setLayerCount]);

    useEffect(() => {
        updateEntities();
    }, [updateEntities]);

    // Handle clicks
    useEffect(() => {
        if (!viewer || viewer.isDestroyed() || !webcams) return;

        const handler = viewer.selectedEntityChanged.addEventListener((entity: Entity | undefined) => {
            if (!entity || !dataSourceRef.current?.entities.contains(entity)) {
                return;
            }

            const cam = webcams.find((c) => c.id === entity.id);
            if (!cam) return;

            onSelect({
                title: cam.name,
                icon: '📷',
                color: '#ff4444',
                fields: [
                    ...(cam.county ? [{ label: 'Fylke', value: cam.county }] : []),
                    { label: 'Breddegrad', value: cam.lat.toFixed(4), unit: '°' },
                    { label: 'Lengdegrad', value: cam.lon.toFixed(4), unit: '°' },
                    { label: 'Bilde', value: '📸 Se kamera' },
                ],
            });
        });

        return () => {
            handler();
        };
    }, [viewer, webcams, onSelect]);

    return null;
}
