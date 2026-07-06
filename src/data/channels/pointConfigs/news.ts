// Nyhetslag som konfig (Fase D). Tidligere NewsLayer.tsx — nå data.
import { fetchNewsEvents } from '@/services/gdelt';
import type { NewsEvent } from '@/types/news';
import type { PointLayerConfig } from '@/data/channels/pointProtocol';
import { emojiRingSpec } from '@/render/pointIconDraw';

const COLOR = '#e040fb';
const ICON = 'news:default';

function toneLabel(tone: number): string {
    if (tone > 2) return 'Positiv';
    if (tone < -2) return 'Negativ';
    return 'Nøytral';
}

export const newsConfig: PointLayerConfig<NewsEvent> = {
    layerId: 'news',
    label: 'Nyheter',
    mode: 'billboard',
    pollMs: 10 * 60 * 1000,
    clustered: true,
    clusterColor: COLOR,
    fetch: (_vp, signal) => fetchNewsEvents(signal),
    getId: (n) => n.id,
    getPosition: (n) => ({ lat: n.lat, lon: n.lon }),
    getStyle: () => ({ iconId: ICON, color: COLOR, sizePx: 20 }),
    atlasSpecs: () => [emojiRingSpec(ICON, '📰', COLOR, 20)],
    buildPopup: (n) => ({
        title: n.title,
        icon: '📰',
        color: COLOR,
        imageUrl: n.imageUrl || undefined,
        imageSize: 'large' as const,
        linkUrl: n.url,
        linkLabel: 'Les artikkel',
        fields: [
            { label: 'Kilde', value: n.domain },
            { label: 'Språk', value: n.language.toUpperCase() },
            { label: 'Tone', value: `${n.tone > 0 ? '+' : ''}${n.tone.toFixed(1)} (${toneLabel(n.tone)})` },
        ],
    }),
    buildTooltip: (n) => ({
        title: n.title.length > 60 ? n.title.slice(0, 57) + '...' : n.title,
        subtitle: n.domain,
        icon: '📰',
        color: COLOR,
    }),
    buildGeoint: (items) => {
        if (items.length === 0) return null;
        const list = items.slice(0, 8).map((n) =>
            `${n.title.length > 70 ? n.title.slice(0, 67) + '...' : n.title} (${n.domain})`);
        return { layerId: 'news', label: 'Nyheter', count: items.length, items: list };
    },
};
