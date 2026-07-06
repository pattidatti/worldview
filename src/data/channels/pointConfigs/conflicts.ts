// Konfliktlag som konfig (Fase D). Tidligere ConflictLayer.tsx.
// Punkt-modus (farget prikk ∝ drepte), klustring ved GLOBAL, pulse på nye.
import { fetchConflicts } from '@/services/acled';
import type { ConflictEvent, ConflictEventType } from '@/types/conflict';
import type { PointLayerConfig } from '@/data/channels/pointProtocol';

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

function color(type: ConflictEventType): string {
    return EVENT_TYPE_COLORS[type] ?? '#ff1744';
}

function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const conflictsConfig: PointLayerConfig<ConflictEvent> = {
    layerId: 'conflicts',
    label: 'Konflikter',
    mode: 'point',
    pollMs: 30 * 60 * 1000,
    clustered: true,
    clusterColor: '#ff1744',
    pulse: true,
    fetch: (_vp, signal) => fetchConflicts(signal),
    getId: (c) => c.id,
    getPosition: (c) => ({ lat: c.lat, lon: c.lon }),
    getStyle: (c) => ({ iconId: '', color: color(c.eventType), sizePx: Math.min(12 + c.fatalities * 0.5, 24) }),
    atlasSpecs: () => [],
    buildPopup: (ev) => {
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
            color: color(ev.eventType),
            description: ev.notes.length > 200 ? ev.notes.slice(0, 197) + '...' : ev.notes,
            fields,
        };
    },
    buildTooltip: (ev) => ({
        title: EVENT_TYPE_NB[ev.eventType] ?? ev.eventType,
        subtitle: `${ev.country} — ${formatDate(ev.eventDate)}`,
        icon: '⚔',
        color: color(ev.eventType),
    }),
    buildGeoint: (items) => {
        if (items.length === 0) return null;
        const sorted = [...items].sort((a, b) => b.fatalities - a.fatalities);
        const list = sorted.slice(0, 10).map((c) => {
            const actors = [c.actor1, c.actor2].filter(Boolean).join(' vs ');
            return `${EVENT_TYPE_NB[c.eventType] ?? c.eventType}: ${actors}, ${c.country} (${c.fatalities} drepte)`;
        });
        return { layerId: 'conflicts', label: 'Konflikter', count: items.length, items: list };
    },
};
