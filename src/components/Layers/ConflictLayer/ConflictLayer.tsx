import { useEffect, useRef, useCallback } from 'react';
import {
    CustomDataSource,
    Entity,
    Cartesian3,
    Color,
    ConstantPositionProperty,
    PointGraphics,
    ConstantProperty,
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { usePollingData } from '@/hooks/usePollingData';
import { configureCluster } from '@/utils/cluster';
import { fetchConflicts } from '@/services/acled';
import { type ConflictEvent, type ConflictEventType } from '@/types/conflict';

const POLL_MS = 30 * 60 * 1000; // 30 min

const EVENT_TYPE_COLORS: Record<ConflictEventType, string> = {
    'Battles': '#ff1744',
    'Violence against civilians': '#8b0000',
    'Explosions/Remote violence': '#ff6d00',
    'Riots': '#ffab00',
    'Protests': '#ffd600',
    'Strategic developments': '#90a4ae',
};

const EVENT_TYPE_NB: Record<string, string> = {
    'Battles': 'Kamper',
    'Violence against civilians': 'Vold mot sivile',
    'Explosions/Remote violence': 'Eksplosjoner',
    'Riots': 'Opptøyer',
    'Protests': 'Protester',
    'Strategic developments': 'Strategiske hendelser',
};

function eventColor(type: ConflictEventType): Color {
    return Color.fromCssColorString(EVENT_TYPE_COLORS[type] ?? '#ff1744');
}

function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ConflictLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const visible = isVisible('conflicts');
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const conflictsRef = useRef<ConflictEvent[]>([]);

    const { data: conflicts, loading, error, lastUpdated } = usePollingData(fetchConflicts, POLL_MS, visible);
    if (conflicts) conflictsRef.current = conflicts;

    useEffect(() => { setLayerError('conflicts', error); }, [error, setLayerError]);
    useEffect(() => { setLayerLastUpdated('conflicts', lastUpdated); }, [lastUpdated, setLayerLastUpdated]);
    useEffect(() => { setLayerLoading('conflicts', loading); }, [loading, setLayerLoading]);

    // Popup builder
    useEffect(() => {
        register('conflicts', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const ev = conflictsRef.current.find((c) => `conflict-${c.id}` === entity.id);
            if (!ev) return null;
            const color = EVENT_TYPE_COLORS[ev.eventType] ?? '#ff1744';
            const fields = [
                { label: 'Type', value: ev.subEventType || ev.eventType },
                { label: 'Dato', value: formatDate(ev.eventDate) },
                { label: 'Sted', value: [ev.admin1, ev.country].filter(Boolean).join(', ') },
            ];
            if (ev.actor1) fields.push({ label: 'Aktør 1', value: ev.actor1 });
            if (ev.actor2) fields.push({ label: 'Aktør 2', value: ev.actor2 });
            fields.push({ label: 'Drepte', value: String(ev.fatalities) });
            fields.push({ label: 'Kilde', value: ev.source });
            return {
                title: EVENT_TYPE_NB[ev.eventType] ?? ev.eventType,
                icon: '⚔',
                color,
                description: ev.notes.length > 200 ? ev.notes.slice(0, 197) + '...' : ev.notes,
                fields,
            };
        });
        return () => unregister('conflicts');
    }, [register, unregister]);

    // Tooltip builder
    useEffect(() => {
        tooltipRegister('conflicts', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const ev = conflictsRef.current.find((c) => `conflict-${c.id}` === entity.id);
            if (!ev) return null;
            return {
                title: EVENT_TYPE_NB[ev.eventType] ?? ev.eventType,
                subtitle: `${ev.country} — ${formatDate(ev.eventDate)}`,
                icon: '⚔',
                color: EVENT_TYPE_COLORS[ev.eventType] ?? '#ff1744',
            };
        });
        return () => tooltipUnregister('conflicts');
    }, [tooltipRegister, tooltipUnregister]);

    // DataSource
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('conflicts');
        configureCluster(ds, { pixelRange: 40, minimumClusterSize: 3, color: '#ff1744' });
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
        if (!ds || !conflicts) return;
        setLayerCount('conflicts', conflicts.length);

        const existing = new Map<string, Entity>();
        for (const entity of ds.entities.values) existing.set(entity.id, entity);
        const seen = new Set<string>();

        for (const ev of conflicts) {
            const id = `conflict-${ev.id}`;
            seen.add(id);
            const pos = Cartesian3.fromDegrees(ev.lon, ev.lat);
            const color = eventColor(ev.eventType);
            const size = Math.min(12 + ev.fatalities * 0.5, 24);

            const entity = existing.get(id);
            if (entity) {
                (entity.position as ConstantPositionProperty).setValue(pos);
                if (entity.point) {
                    (entity.point.pixelSize as ConstantProperty).setValue(size);
                    (entity.point.color as unknown as ConstantProperty).setValue(color);
                    (entity.point.outlineColor as unknown as ConstantProperty).setValue(color.withAlpha(1.0));
                }
            } else {
                ds.entities.add(new Entity({
                    id,
                    name: EVENT_TYPE_NB[ev.eventType] ?? ev.eventType,
                    position: pos,
                    point: new PointGraphics({
                        pixelSize: size,
                        color,
                        outlineColor: color.withAlpha(1.0),
                        outlineWidth: 1,
                        heightReference: 1, // CLAMP_TO_GROUND
                    }),
                }));
            }
        }

        for (const [id] of existing) {
            if (!seen.has(id)) ds.entities.removeById(id);
        }

        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [conflicts, viewer, setLayerCount]);

    useEffect(() => { updateEntities(); }, [updateEntities]);

    return null;
}
