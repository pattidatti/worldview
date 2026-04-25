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
import { useLayerActions, useLayerVisibility } from '@/store/layerStore';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { useGeointRegistry } from '@/context/GeointContext';
import { usePollingData } from '@/hooks/usePollingData';
import { syncEntities } from '@/utils/syncEntities';
import { fetchVolcanoes } from '@/services/volcanoes';
import { type VolcanoEvent, type VolcanoAlertLevel } from '@/types/volcano';

const POLL_MS = 2 * 60 * 60 * 1000; // 2 timer

const ALERT_STYLE: Record<VolcanoAlertLevel, { color: string; label: string; size: number }> = {
    warning:    { color: '#ff1744', label: 'Advarsel',  size: 40 },
    watch:      { color: '#ff6d00', label: 'Varsel', size: 36 },
    advisory:   { color: '#ffd600', label: 'Rådgivning', size: 32 },
    normal:     { color: '#69f0ae', label: 'Normal',    size: 28 },
    unassigned: { color: '#90caf9', label: 'Ukjent',    size: 28 },
};

function createVolcanoIcon(color: string, size: number): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="1.5"/>
        <text x="${size / 2}" y="${size * 0.7}" text-anchor="middle" font-size="${size * 0.55}">🌋</text>
    </svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function formatDate(ts: number): string {
    return new Date(ts).toLocaleString('nb-NO', { dateStyle: 'medium', timeStyle: 'short' });
}

export function VolcanoLayer() {
    const viewer = useViewer();
    const { setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } = useLayerActions();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const { register: geointRegister, unregister: geointUnregister } = useGeointRegistry();
    const visible = useLayerVisibility('volcanoes');
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const volcanoesRef = useRef<VolcanoEvent[]>([]);

    const { data: volcanoes, loading, error, lastUpdated } = usePollingData(fetchVolcanoes, POLL_MS, visible);
    if (volcanoes) volcanoesRef.current = volcanoes;

    useEffect(() => {
        geointRegister('volcanoes', () => {
            const vs = volcanoesRef.current;
            if (vs.length === 0) return null;
            const items = vs.slice(0, 6).map((v) => `${v.name} — ${ALERT_STYLE[v.alertLevel].label}`);
            return { layerId: 'volcanoes', label: 'Vulkaner', count: vs.length, items };
        });
        return () => geointUnregister('volcanoes');
    }, [geointRegister, geointUnregister]);

    useEffect(() => { setLayerError('volcanoes', error); }, [error, setLayerError]);
    useEffect(() => { setLayerLastUpdated('volcanoes', lastUpdated); }, [lastUpdated, setLayerLastUpdated]);
    useEffect(() => { setLayerLoading('volcanoes', loading); }, [loading, setLayerLoading]);

    useEffect(() => {
        register('volcanoes', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const v = volcanoesRef.current.find((x) => `volcano-${x.id}` === entity.id);
            if (!v) return null;
            const style = ALERT_STYLE[v.alertLevel];
            return {
                title: v.name,
                icon: '🌋',
                color: style.color,
                linkUrl: v.url || undefined,
                fields: [
                    { label: 'Varselnivå', value: style.label },
                    { label: 'Sist oppdatert', value: formatDate(v.publishedAt) },
                    ...(v.region ? [{ label: 'Region', value: v.region }] : []),
                    ...(v.description ? [{ label: 'Beskrivelse', value: v.description.replace(/<[^>]+>/g, '').slice(0, 300) }] : []),
                ],
            };
        });
        return () => unregister('volcanoes');
    }, [register, unregister]);

    useEffect(() => {
        tooltipRegister('volcanoes', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const v = volcanoesRef.current.find((x) => `volcano-${x.id}` === entity.id);
            if (!v) return null;
            const style = ALERT_STYLE[v.alertLevel];
            return { title: v.name, subtitle: style.label, icon: '🌋', color: style.color };
        });
        return () => tooltipUnregister('volcanoes');
    }, [tooltipRegister, tooltipUnregister]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('volcanoes');
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
        if (!ds || !volcanoes) return;
        setLayerCount('volcanoes', volcanoes.length);
        syncEntities({
            ds,
            items: volcanoes,
            getId: (v) => `volcano-${v.id}`,
            onUpdate: (entity, v) => {
                (entity.position as ConstantPositionProperty).setValue(
                    Cartesian3.fromDegrees(v.lon, v.lat)
                );
            },
            onCreate: (v) => {
                const style = ALERT_STYLE[v.alertLevel];
                return new Entity({
                    id: `volcano-${v.id}`,
                    name: v.name,
                    position: Cartesian3.fromDegrees(v.lon, v.lat),
                    billboard: {
                        image: createVolcanoIcon(style.color, style.size),
                        width: style.size,
                        height: style.size,
                        color: Color.fromCssColorString(style.color),
                        verticalOrigin: VerticalOrigin.CENTER,
                        horizontalOrigin: HorizontalOrigin.CENTER,
                        heightReference: HeightReference.CLAMP_TO_GROUND,
                    },
                });
            },
            viewer,
        });
    }, [volcanoes, viewer, setLayerCount]);

    useEffect(() => { updateEntities(); }, [updateEntities]);

    return null;
}
