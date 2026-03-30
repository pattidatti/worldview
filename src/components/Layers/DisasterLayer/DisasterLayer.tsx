import { useEffect, useRef, useCallback } from 'react';
import {
    CustomDataSource,
    Entity,
    Cartesian3,
    Color,
    ConstantPositionProperty,
    VerticalOrigin,
    HorizontalOrigin,
    HeightReference,
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { usePollingData } from '@/hooks/usePollingData';
import { fetchDisasters } from '@/services/eonet';
import { type Disaster } from '@/types/disaster';

const POLL_MS = 30 * 60 * 1000; // 30 min

const CATEGORY_STYLE: Record<string, { icon: string; color: string }> = {
    'Wildfires':          { icon: '🔥', color: '#ff4400' },
    'Severe Storms':      { icon: '⛈', color: '#8844ff' },
    'Volcanoes':          { icon: '🌋', color: '#ff8800' },
    'Sea and Lake Ice':   { icon: '🧊', color: '#88ddff' },
    'Floods':             { icon: '💧', color: '#0088ff' },
    'Drought':            { icon: '☀', color: '#ffcc00' },
    'Dust and Haze':      { icon: '💨', color: '#ccaa88' },
    'Manmade':            { icon: '⚠', color: '#ff6600' },
    'Snow':               { icon: '❄', color: '#cceeff' },
    'Temperature Extremes': { icon: '🌡', color: '#ff4488' },
    'Landslides':         { icon: '⛰', color: '#aa8844' },
    'Water Color':        { icon: '🌊', color: '#0044cc' },
};

const DEFAULT_STYLE = { icon: '⚠', color: '#ffaa00' };

function getStyle(category: string) {
    return CATEGORY_STYLE[category] ?? DEFAULT_STYLE;
}

function createDisasterIcon(icon: string, color: string): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="14" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="1.5"/>
        <text x="16" y="21" text-anchor="middle" font-size="16">${icon}</text>
    </svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function formatDate(dateStr: string): string {
    try {
        return new Date(dateStr).toLocaleString('nb-NO', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
        return dateStr;
    }
}

export function DisasterLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const visible = isVisible('disasters');
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const disastersRef = useRef<Disaster[]>([]);

    const { data: disasters, loading, error, lastUpdated } = usePollingData(fetchDisasters, POLL_MS, visible);
    if (disasters) disastersRef.current = disasters;

    useEffect(() => { setLayerError('disasters', error); }, [error, setLayerError]);
    useEffect(() => { setLayerLastUpdated('disasters', lastUpdated); }, [lastUpdated, setLayerLastUpdated]);
    useEffect(() => { setLayerLoading('disasters', loading); }, [loading, setLayerLoading]);

    useEffect(() => {
        register('disasters', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const d = disastersRef.current.find((x) => `disaster-${x.id}` === entity.id);
            if (!d) return null;
            const { icon, color } = getStyle(d.category);
            return {
                title: d.title,
                icon,
                color,
                linkUrl: d.url,
                fields: [
                    { label: 'Kategori', value: d.category },
                    { label: 'Dato', value: formatDate(d.date) },
                ],
            };
        });
        return () => unregister('disasters');
    }, [register, unregister]);

    useEffect(() => {
        tooltipRegister('disasters', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const d = disastersRef.current.find((x) => `disaster-${x.id}` === entity.id);
            if (!d) return null;
            const { icon, color } = getStyle(d.category);
            return { title: d.title, subtitle: d.category, icon, color };
        });
        return () => tooltipUnregister('disasters');
    }, [tooltipRegister, tooltipUnregister]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('disasters');
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
        if (!ds || !disasters) return;
        setLayerCount('disasters', disasters.length);
        const existing = new Map<string, Entity>();
        for (const entity of ds.entities.values) existing.set(entity.id, entity);
        const seen = new Set<string>();
        for (const d of disasters) {
            const id = `disaster-${d.id}`;
            seen.add(id);
            const pos = Cartesian3.fromDegrees(d.lon, d.lat);
            const { icon, color } = getStyle(d.category);
            const cesiumColor = Color.fromCssColorString(color);
            const entity = existing.get(id);
            if (entity) {
                (entity.position as ConstantPositionProperty).setValue(pos);
            } else {
                ds.entities.add(new Entity({
                    id,
                    name: d.title,
                    position: pos,
                    billboard: {
                        image: createDisasterIcon(icon, color),
                        width: 32, height: 32,
                        color: cesiumColor,
                        verticalOrigin: VerticalOrigin.CENTER,
                        horizontalOrigin: HorizontalOrigin.CENTER,
                        heightReference: HeightReference.CLAMP_TO_GROUND,
                    },
                }));
            }
        }
        for (const [id] of existing) {
            if (!seen.has(id)) ds.entities.removeById(id);
        }
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [disasters, viewer, setLayerCount]);

    useEffect(() => { updateEntities(); }, [updateEntities]);

    return null;
}
