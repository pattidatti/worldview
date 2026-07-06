// Rakettoppskyting som konfig (Fase D). Tidligere LaunchesLayer.tsx.
import { fetchLaunches } from '@/services/launches';
import type { RocketLaunch } from '@/types/launch';
import type { PointLayerConfig } from '@/data/channels/pointProtocol';
import { emojiRingSpec } from '@/render/pointIconDraw';

const COLOR = '#ff6b35';
const ICON = 'launches:default';

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

export const launchesConfig: PointLayerConfig<RocketLaunch> = {
    layerId: 'launches',
    label: 'Rakettoppskyting',
    mode: 'billboard',
    pollMs: 2 * 60 * 60 * 1000,
    fetch: () => fetchLaunches(),
    getId: (l) => l.id,
    getPosition: (l) => ({ lat: l.lat, lon: l.lon }),
    getStyle: () => ({ iconId: ICON, color: COLOR, sizePx: 36 }),
    atlasSpecs: () => [emojiRingSpec(ICON, '🚀', COLOR, 36)],
    buildPopup: (l) => {
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
        return { title: l.name, icon: '🚀', color: COLOR, imageUrl: l.imageUrl, linkUrl: l.infoUrl, fields };
    },
    buildTooltip: (l) => ({
        title: l.name,
        subtitle: `${l.provider} · ${formatCountdown(l.net)}`,
        icon: '🚀',
        color: COLOR,
    }),
    buildGeoint: (items) => {
        if (items.length === 0) return null;
        const list = items.slice(0, 5).map((l) => `${l.name} — ${formatCountdown(l.net)}`);
        return { layerId: 'launches', label: 'Rakettoppskyting', count: items.length, items: list };
    },
};
