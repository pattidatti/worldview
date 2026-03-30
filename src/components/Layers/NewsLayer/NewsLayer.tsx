import { useEffect, useRef, useCallback } from 'react';
import {
    CustomDataSource,
    Entity,
    Cartesian3,
    BillboardGraphics,
    VerticalOrigin,
    HorizontalOrigin,
    HeightReference,
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { usePollingData } from '@/hooks/usePollingData';
import { configureCluster } from '@/utils/cluster';
import { fetchNewsEvents } from '@/services/gdelt';
import { type NewsEvent } from '@/types/news';

const POLL_MS = 10 * 60 * 1000; // 10 min

const NEWS_ICON = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="9" fill="#e040fb" stroke="#1a1a2e" stroke-width="1"/>
        <rect x="5" y="6" width="10" height="8" rx="1" fill="#1a1a2e" opacity="0.5"/>
        <rect x="6" y="7.5" width="8" height="1" rx="0.5" fill="#e040fb"/>
        <rect x="6" y="9.5" width="5" height="1" rx="0.5" fill="#e040fb" opacity="0.7"/>
        <rect x="6" y="11.5" width="6" height="1" rx="0.5" fill="#e040fb" opacity="0.5"/>
    </svg>`,
)}`;

function toneLabel(tone: number): string {
    if (tone > 2) return 'Positiv';
    if (tone < -2) return 'Negativ';
    return 'Nøytral';
}

export function NewsLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const visible = isVisible('news');
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const newsRef = useRef<NewsEvent[]>([]);

    const { data: news, loading, error, lastUpdated } = usePollingData(fetchNewsEvents, POLL_MS, visible);
    if (news) newsRef.current = news;

    useEffect(() => { setLayerError('news', error); }, [error, setLayerError]);
    useEffect(() => { setLayerLastUpdated('news', lastUpdated); }, [lastUpdated, setLayerLastUpdated]);
    useEffect(() => { setLayerLoading('news', loading); }, [loading, setLayerLoading]);

    // Popup builder
    useEffect(() => {
        register('news', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const item = newsRef.current.find((n) => `news-${n.id}` === entity.id);
            if (!item) return null;
            return {
                title: item.title,
                icon: '📰',
                color: '#e040fb',
                imageUrl: item.imageUrl || undefined,
                imageSize: 'large' as const,
                linkUrl: item.url,
                linkLabel: 'Les artikkel',
                fields: [
                    { label: 'Kilde', value: item.domain },
                    { label: 'Språk', value: item.language.toUpperCase() },
                    { label: 'Tone', value: `${item.tone > 0 ? '+' : ''}${item.tone.toFixed(1)} (${toneLabel(item.tone)})` },
                ],
            };
        });
        return () => unregister('news');
    }, [register, unregister]);

    // Tooltip builder
    useEffect(() => {
        tooltipRegister('news', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const item = newsRef.current.find((n) => `news-${n.id}` === entity.id);
            if (!item) return null;
            return {
                title: item.title.length > 60 ? item.title.slice(0, 57) + '...' : item.title,
                subtitle: item.domain,
                icon: '📰',
                color: '#e040fb',
            };
        });
        return () => tooltipUnregister('news');
    }, [tooltipRegister, tooltipUnregister]);

    // DataSource
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('news');
        configureCluster(ds, { pixelRange: 50, minimumClusterSize: 3, color: '#e040fb' });
        viewer.dataSources.add(ds);
        dataSourceRef.current = ds;
        return () => {
            if (!viewer.isDestroyed()) viewer.dataSources.remove(ds, true);
            dataSourceRef.current = null;
        };
    }, [viewer]);

    // Visibility
    useEffect(() => {
        if (dataSourceRef.current) dataSourceRef.current.show = visible;
    }, [visible]);

    // Entity sync
    const updateEntities = useCallback(() => {
        const ds = dataSourceRef.current;
        if (!ds || !news) return;
        setLayerCount('news', news.length);
        ds.entities.removeAll();
        for (const item of news) {
            ds.entities.add(new Entity({
                id: `news-${item.id}`,
                name: item.title,
                position: Cartesian3.fromDegrees(item.lon, item.lat, 0),
                billboard: new BillboardGraphics({
                    image: NEWS_ICON,
                    width: 20,
                    height: 20,
                    verticalOrigin: VerticalOrigin.CENTER,
                    horizontalOrigin: HorizontalOrigin.CENTER,
                    heightReference: HeightReference.CLAMP_TO_GROUND,
                }),
            }));
        }
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [news, viewer, setLayerCount]);

    useEffect(() => { updateEntities(); }, [updateEntities]);

    return null;
}
