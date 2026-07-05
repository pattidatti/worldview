// Rene parse-funksjoner for store JSON-feeds (GDELT ~2000 features,
// ACLED ~2000 rader). Delt mellom hovedtråd-fallback og feedParser-workeren
// slik at parsingen kan flyttes av main thread.

import { type NewsEvent } from '@/types/news';
import { type ConflictEvent, type ConflictEventType } from '@/types/conflict';

const MAX_NEWS_RESULTS = 2000;

export function parseGdelt(json: unknown): NewsEvent[] {
    const features: unknown[] = (json as { features?: unknown[] })?.features ?? [];

    const events: NewsEvent[] = [];
    for (const f of features) {
        const feat = f as {
            geometry?: { coordinates?: [number, number] };
            properties?: {
                name?: string;
                url?: string;
                domain?: string;
                shareimage?: string;
                language?: string;
                tone?: number;
            };
        };
        const coords = feat.geometry?.coordinates;
        const props = feat.properties;
        if (!coords || !props?.name || !props?.url) continue;

        const [lon, lat] = coords;
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        events.push({
            id: `${lon.toFixed(3)}_${lat.toFixed(3)}_${btoa(props.url.slice(-40)).slice(0, 12)}`,
            title: props.name,
            url: props.url,
            domain: props.domain ?? '',
            imageUrl: props.shareimage ?? '',
            language: props.language ?? '',
            tone: props.tone ?? 0,
            lat,
            lon,
        });

        if (events.length >= MAX_NEWS_RESULTS) break;
    }
    return events;
}

export function parseAcled(json: unknown): ConflictEvent[] {
    const data: unknown[] = (json as { data?: unknown[] })?.data ?? [];

    return data.map((d) => {
        const row = d as Record<string, string>;
        return {
            id: row.data_id ?? '',
            eventDate: row.event_date ?? '',
            eventType: (row.event_type ?? 'Battles') as ConflictEventType,
            subEventType: row.sub_event_type ?? '',
            actor1: row.actor1 ?? '',
            actor2: row.actor2 ?? '',
            country: row.country ?? '',
            admin1: row.admin1 ?? '',
            lat: parseFloat(row.latitude),
            lon: parseFloat(row.longitude),
            fatalities: parseInt(row.fatalities) || 0,
            notes: row.notes ?? '',
            source: row.source ?? '',
        };
    }).filter((ev) => Number.isFinite(ev.lat) && Number.isFinite(ev.lon));
}
