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
import { fetchLaunches } from '@/services/launches';
import { type RocketLaunch } from '@/types/launch';

const POLL_MS = 2 * 60 * 60 * 1000; // 2 timer
const LAUNCH_COLOR = '#ff6b35';

function createLaunchIcon(): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="16" fill="${LAUNCH_COLOR}" fill-opacity="0.2" stroke="${LAUNCH_COLOR}" stroke-width="1.5"/>
        <text x="18" y="24" text-anchor="middle" font-size="18">🚀</text>
    </svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function formatCountdown(netStr: string): string {
    const diff = new Date(netStr).getTime() - Date.now();
    if (diff < 0) return 'Allerede skutt opp';
    const days = Math.floor(diff / 86_400_000);
    const hours = Math.floor((diff % 86_400_000) / 3_600_000);
    const mins = Math.floor((diff % 3_600_000) / 60_000);
    if (days > 0) return `om ${days}d ${hours}t`;
    if (hours > 0) return `om ${hours}t ${mins}min`;
    return `om ${mins}min`;
}

function formatDate(isoStr: string): string {
    try {
        return new Date(isoStr).toLocaleString('nb-NO', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
        return isoStr;
    }
}

export function LaunchesLayer() {
    const viewer = useViewer();
    const { setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } = useLayerActions();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const { register: geointRegister, unregister: geointUnregister } = useGeointRegistry();
    const visible = useLayerVisibility('launches');
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const launchesRef = useRef<RocketLaunch[]>([]);

    const { data: launches, loading, error, lastUpdated } = usePollingData(fetchLaunches, POLL_MS, visible);
    if (launches) launchesRef.current = launches;

    useEffect(() => {
        geointRegister('launches', () => {
            const ls = launchesRef.current;
            if (ls.length === 0) return null;
            const items = ls.slice(0, 5).map((l) => `${l.name} — ${formatCountdown(l.net)}`);
            return { layerId: 'launches', label: 'Rakettoppskyting', count: ls.length, items };
        });
        return () => geointUnregister('launches');
    }, [geointRegister, geointUnregister]);

    useEffect(() => { setLayerError('launches', error); }, [error, setLayerError]);
    useEffect(() => { setLayerLastUpdated('launches', lastUpdated); }, [lastUpdated, setLayerLastUpdated]);
    useEffect(() => { setLayerLoading('launches', loading); }, [loading, setLayerLoading]);

    useEffect(() => {
        register('launches', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const l = launchesRef.current.find((x) => `launch-${x.id}` === entity.id);
            if (!l) return null;
            const fields: { label: string; value: string }[] = [
                { label: 'Leverandør', value: l.provider || '—' },
                { label: 'Rakett', value: l.rocketName || '—' },
                { label: 'Oppskytingsrampe', value: l.padName },
                { label: 'Oppskytingstid', value: formatDate(l.net) },
                { label: 'Nedtelling', value: formatCountdown(l.net) },
                { label: 'Status', value: l.statusName || '—' },
            ];
            if (l.missionDescription) {
                fields.push({ label: 'Oppdrag', value: l.missionDescription.slice(0, 200) + (l.missionDescription.length > 200 ? '…' : '') });
            }
            return {
                title: l.name,
                icon: '🚀',
                color: LAUNCH_COLOR,
                imageUrl: l.imageUrl,
                linkUrl: l.infoUrl,
                fields,
            };
        });
        return () => unregister('launches');
    }, [register, unregister]);

    useEffect(() => {
        tooltipRegister('launches', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const l = launchesRef.current.find((x) => `launch-${x.id}` === entity.id);
            if (!l) return null;
            return {
                title: l.name,
                subtitle: `${l.provider} · ${formatCountdown(l.net)}`,
                icon: '🚀',
                color: LAUNCH_COLOR,
            };
        });
        return () => tooltipUnregister('launches');
    }, [tooltipRegister, tooltipUnregister]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('launches');
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
        if (!ds || !launches) return;
        setLayerCount('launches', launches.length);
        syncEntities({
            ds,
            items: launches,
            getId: (l) => `launch-${l.id}`,
            onUpdate: (entity, l) => {
                (entity.position as ConstantPositionProperty).setValue(
                    Cartesian3.fromDegrees(l.lon, l.lat)
                );
            },
            onCreate: (l) => new Entity({
                id: `launch-${l.id}`,
                name: l.name,
                position: Cartesian3.fromDegrees(l.lon, l.lat),
                billboard: {
                    image: createLaunchIcon(),
                    width: 36,
                    height: 36,
                    color: Color.fromCssColorString(LAUNCH_COLOR),
                    verticalOrigin: VerticalOrigin.CENTER,
                    horizontalOrigin: HorizontalOrigin.CENTER,
                    heightReference: HeightReference.CLAMP_TO_GROUND,
                },
            }),
            viewer,
        });
    }, [launches, viewer, setLayerCount]);

    useEffect(() => { updateEntities(); }, [updateEntities]);

    return null;
}
