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
import { fetchWebcams } from '@/services/vegvesen-webcam';
import { type Webcam } from '@/types/webcam';

const WEBCAM_COLOR = Color.fromCssColorString('#ff4444');
const POLL_MS = 5 * 60 * 1000;

export function WebcamLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const visible = isVisible('webcams');
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const webcamsRef = useRef<Webcam[]>([]);

    const { data: webcams, loading } = usePollingData(fetchWebcams, POLL_MS, visible);
    if (webcams) webcamsRef.current = webcams;

    // Register popup builder
    useEffect(() => {
        register('webcams', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const cam = webcamsRef.current.find((c) => c.id === entity.id);
            if (!cam) return null;
            return {
                title: cam.name,
                icon: '📷',
                color: '#ff4444',
                fields: [
                    ...(cam.county ? [{ label: 'Fylke', value: cam.county }] : []),
                    { label: 'Breddegrad', value: cam.lat.toFixed(4), unit: '°' },
                    { label: 'Lengdegrad', value: cam.lon.toFixed(4), unit: '°' },
                    { label: 'Bilde', value: '📸 Se kamera' },
                ],
            };
        });
        return () => unregister('webcams');
    }, [register, unregister]);

    useEffect(() => { setLayerLoading('webcams', loading); }, [loading, setLayerLoading]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('webcams');
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
        if (!ds || !webcams) return;
        setLayerCount('webcams', webcams.length);
        ds.entities.removeAll();
        for (const cam of webcams) {
            ds.entities.add(new Entity({
                id: cam.id, name: cam.name,
                position: Cartesian3.fromDegrees(cam.lon, cam.lat, 0),
                point: new PointGraphics({
                    pixelSize: 6, color: WEBCAM_COLOR,
                    outlineColor: Color.fromCssColorString('#ff444466'), outlineWidth: 2,
                }),
            }));
        }
    }, [webcams, setLayerCount]);

    useEffect(() => { updateEntities(); }, [updateEntities]);

    return null;
}
