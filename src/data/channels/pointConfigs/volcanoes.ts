// Vulkanlag som konfig (Fase D). Tidligere VolcanoLayer.tsx.
import { fetchVolcanoes } from '@/services/volcanoes';
import type { VolcanoEvent, VolcanoAlertLevel } from '@/types/volcano';
import type { PointLayerConfig } from '@/data/channels/pointProtocol';
import { emojiRingSpec } from '@/render/pointIconDraw';

const ALERT_STYLE: Record<VolcanoAlertLevel, { color: string; label: string; size: number }> = {
    warning:    { color: '#ff1744', label: 'Advarsel',   size: 40 },
    watch:      { color: '#ff6d00', label: 'Varsel',      size: 36 },
    advisory:   { color: '#ffd600', label: 'Rådgivning',  size: 32 },
    normal:     { color: '#69f0ae', label: 'Normal',      size: 28 },
    unassigned: { color: '#90caf9', label: 'Ukjent',      size: 28 },
};

function formatDate(ts: number): string {
    return new Date(ts).toLocaleString('nb-NO', { dateStyle: 'medium', timeStyle: 'short' });
}

export const volcanoesConfig: PointLayerConfig<VolcanoEvent> = {
    layerId: 'volcanoes',
    label: 'Vulkaner',
    mode: 'billboard',
    pollMs: 2 * 60 * 60 * 1000,
    fetch: () => fetchVolcanoes(),
    getId: (v) => v.id,
    getPosition: (v) => ({ lat: v.lat, lon: v.lon }),
    getStyle: (v) => ({ iconId: `volcanoes:${v.alertLevel}`, color: ALERT_STYLE[v.alertLevel].color, sizePx: ALERT_STYLE[v.alertLevel].size }),
    atlasSpecs: () =>
        (Object.entries(ALERT_STYLE) as [VolcanoAlertLevel, { color: string; size: number }][]).map(
            ([level, s]) => emojiRingSpec(`volcanoes:${level}`, '🌋', s.color, s.size),
        ),
    buildPopup: (v) => {
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
    },
    buildTooltip: (v) => {
        const style = ALERT_STYLE[v.alertLevel];
        return { title: v.name, subtitle: style.label, icon: '🌋', color: style.color };
    },
    buildGeoint: (items) => {
        if (items.length === 0) return null;
        const list = items.slice(0, 6).map((v) => `${v.name} — ${ALERT_STYLE[v.alertLevel].label}`);
        return { layerId: 'volcanoes', label: 'Vulkaner', count: items.length, items: list };
    },
};
