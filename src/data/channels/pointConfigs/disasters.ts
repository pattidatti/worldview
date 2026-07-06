// Naturkatastrofelag som konfig (Fase D). Tidligere DisasterLayer.tsx.
import { fetchDisasters } from '@/services/eonet';
import type { Disaster } from '@/types/disaster';
import type { PointLayerConfig } from '@/data/channels/pointProtocol';
import type { AtlasIconSpec } from '@/render/IconAtlas';
import { emojiRingSpec } from '@/render/pointIconDraw';

const CATEGORY_STYLE: Record<string, { icon: string; color: string }> = {
    'Wildfires':            { icon: '🔥', color: '#ff4400' },
    'Severe Storms':        { icon: '⛈', color: '#8844ff' },
    'Volcanoes':            { icon: '🌋', color: '#ff8800' },
    'Sea and Lake Ice':     { icon: '🧊', color: '#88ddff' },
    'Floods':               { icon: '💧', color: '#0088ff' },
    'Drought':              { icon: '☀', color: '#ffcc00' },
    'Dust and Haze':        { icon: '💨', color: '#ccaa88' },
    'Manmade':              { icon: '⚠', color: '#ff6600' },
    'Snow':                 { icon: '❄', color: '#cceeff' },
    'Temperature Extremes': { icon: '🌡', color: '#ff4488' },
    'Landslides':           { icon: '⛰', color: '#aa8844' },
    'Water Color':          { icon: '🌊', color: '#0044cc' },
};
const DEFAULT_STYLE = { icon: '⚠', color: '#ffaa00' };

function iconIdFor(category: string): string {
    return CATEGORY_STYLE[category] ? `disasters:${category}` : 'disasters:default';
}

function styleFor(category: string) {
    return CATEGORY_STYLE[category] ?? DEFAULT_STYLE;
}

function formatDate(dateStr: string): string {
    try {
        return new Date(dateStr).toLocaleString('nb-NO', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
        return dateStr;
    }
}

export const disastersConfig: PointLayerConfig<Disaster> = {
    layerId: 'disasters',
    label: 'Naturkatastrofer',
    mode: 'billboard',
    pollMs: 30 * 60 * 1000,
    pulse: true,
    fetch: (_vp, signal) => fetchDisasters(signal),
    getId: (d) => d.id,
    getPosition: (d) => ({ lat: d.lat, lon: d.lon }),
    getStyle: (d) => ({ iconId: iconIdFor(d.category), color: styleFor(d.category).color, sizePx: 32 }),
    atlasSpecs: () => {
        const specs: AtlasIconSpec[] = [];
        for (const [cat, s] of Object.entries(CATEGORY_STYLE)) {
            specs.push(emojiRingSpec(`disasters:${cat}`, s.icon, s.color, 32));
        }
        specs.push(emojiRingSpec('disasters:default', DEFAULT_STYLE.icon, DEFAULT_STYLE.color, 32));
        return specs;
    },
    buildPopup: (d) => {
        const { icon, color } = styleFor(d.category);
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
    },
    buildTooltip: (d) => {
        const { icon, color } = styleFor(d.category);
        return { title: d.title, subtitle: d.category, icon, color };
    },
    buildGeoint: (items) => {
        if (items.length === 0) return null;
        const list = items.slice(0, 8).map((d) => `${d.category}: ${d.title}`);
        return { layerId: 'disasters', label: 'Naturkatastrofer', count: items.length, items: list };
    },
};
