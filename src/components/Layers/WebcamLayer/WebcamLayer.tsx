import { useEffect, useRef, useCallback, useState } from 'react';
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
import { useViewport } from '@/hooks/useViewport';
import { fetchWebcams } from '@/services/webcams';
import { type Webcam } from '@/types/webcam';

const WEBCAM_COLOR = Color.fromCssColorString('#ff4444');
const POLL_MS = 10 * 60 * 1000; // 10 min (bilde-URLer utløper etter 10 min i free tier)

export function WebcamLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const visible = isVisible('webcams');
    const viewport = useViewport(viewer);
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const webcamsRef = useRef<Webcam[]>([]);

    const [webcams, setWebcams] = useState<Webcam[] | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!visible || !viewport) return;

        const controller = new AbortController();
        let cancelled = false;

        const doFetch = async () => {
            setLoading(true);
            try {
                const result = await fetchWebcams(viewport, controller.signal);
                if (!cancelled) setWebcams(result);
            } catch (err) {
                if (!cancelled && !(err instanceof DOMException && err.name === 'AbortError')) {
                    console.error('[WebcamLayer] fetch error:', err);
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
    }, [visible, viewport]);

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
                imageUrl: cam.imageUrl,
                fields: [
                    ...(cam.city ? [{ label: 'Sted', value: cam.city }] : []),
                    ...(cam.country ? [{ label: 'Land', value: cam.country }] : []),
                    { label: 'Posisjon', value: `${cam.lat.toFixed(2)}°N, ${cam.lon.toFixed(2)}°E` },
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
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [webcams, viewer, setLayerCount]);

    useEffect(() => { updateEntities(); }, [updateEntities]);

    return null;
}
