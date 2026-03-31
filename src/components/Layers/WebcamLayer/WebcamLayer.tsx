import { useEffect, useRef, useCallback, useState } from 'react';
import {
    CustomDataSource,
    Entity,
    Cartesian3,
    Color,
    BillboardGraphics,
    VerticalOrigin,
    HorizontalOrigin,
    HeightReference,
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { useViewport } from '@/hooks/useViewport';
import { configureCluster } from '@/utils/cluster';
import { fetchWebcams } from '@/services/webcams';
import { type Webcam } from '@/types/webcam';

const WEBCAM_COLOR = Color.WHITE;
const POLL_MS = 10 * 60 * 1000; // 10 min (bilde-URLer utløper etter 10 min i free tier)

function formatTime(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const time = d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return time;
    return `${d.toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit' })} ${time}`;
}

const CAMERA_ICON = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
        <rect x="3" y="9" width="18" height="14" rx="2" fill="#ff4444" stroke="#1a1a2e" stroke-width="0.8"/>
        <circle cx="12" cy="16" r="4" fill="#1a1a2e" opacity="0.5"/>
        <circle cx="12" cy="16" r="2.5" fill="#ff6666"/>
        <polygon points="21,12 27,9 27,23 21,20" fill="#ff4444" stroke="#1a1a2e" stroke-width="0.8"/>
        <circle cx="18" cy="11" r="1.2" fill="#ff6666"/>
    </svg>`,
)}`;

export function WebcamLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
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
                if (!cancelled) {
                    setWebcams(result);
                    setLayerError('webcams', null);
                    setLayerLastUpdated('webcams', Date.now());
                }
            } catch (err) {
                if (!cancelled && !(err instanceof DOMException && err.name === 'AbortError')) {
                    if (import.meta.env.DEV) console.error('[WebcamLayer] fetch error:', err);
                    setLayerError('webcams', err instanceof Error ? err.message : 'Ukjent feil');
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
                imageSize: 'large' as const,
                fields: [
                    ...(cam.city ? [{ label: 'Sted', value: cam.city }] : []),
                    ...(cam.country ? [{ label: 'Land', value: cam.country }] : []),
                    ...(cam.lastUpdated ? [{ label: 'Oppdatert', value: formatTime(cam.lastUpdated) }] : []),
                    { label: 'Posisjon', value: `${cam.lat.toFixed(2)}°N, ${cam.lon.toFixed(2)}°E` },
                ],
            };
        });
        return () => unregister('webcams');
    }, [register, unregister]);

    // Register tooltip builder
    useEffect(() => {
        tooltipRegister('webcams', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const cam = webcamsRef.current.find((c) => c.id === entity.id);
            if (!cam) return null;
            return {
                title: cam.name,
                subtitle: [cam.city, cam.country].filter(Boolean).join(', '),
                icon: '📷',
                color: '#ff4444',
            };
        });
        return () => tooltipUnregister('webcams');
    }, [tooltipRegister, tooltipUnregister]);

    useEffect(() => { setLayerLoading('webcams', loading); }, [loading, setLayerLoading]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('webcams');
        configureCluster(ds, { pixelRange: 35, minimumClusterSize: 2, color: '#ff4444' });
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
                billboard: new BillboardGraphics({
                    image: CAMERA_ICON,
                    width: 28, height: 28,
                    color: WEBCAM_COLOR,
                    verticalOrigin: VerticalOrigin.CENTER,
                    horizontalOrigin: HorizontalOrigin.CENTER,
                    heightReference: HeightReference.CLAMP_TO_GROUND,
                }),
            }));
        }
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [webcams, viewer, setLayerCount]);

    useEffect(() => { updateEntities(); }, [updateEntities]);

    return null;
}
