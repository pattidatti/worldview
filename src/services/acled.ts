import { type ConflictEvent, type ConflictEventType } from '@/types/conflict';

const API_KEY = import.meta.env.VITE_ACLED_API_KEY || '';
const EMAIL = import.meta.env.VITE_ACLED_EMAIL || '';
const BASE_URL = 'https://api.acleddata.com/acled/read';

function dateString(d: Date): string {
    return d.toISOString().slice(0, 10);
}

export async function fetchConflicts(): Promise<ConflictEvent[]> {
    if (!API_KEY || !EMAIL) {
        if (import.meta.env.DEV) console.warn('[ConflictLayer] VITE_ACLED_API_KEY og/eller VITE_ACLED_EMAIL mangler — konflikdatalaget er deaktivert.');
        return [];
    }

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams({
        key: API_KEY,
        email: EMAIL,
        event_date: `${dateString(weekAgo)}|${dateString(now)}`,
        event_date_where: 'BETWEEN',
        limit: '2000',
        fields: 'data_id|event_date|event_type|sub_event_type|actor1|actor2|country|admin1|latitude|longitude|fatalities|notes|source',
    });

    const response = await fetch(`${BASE_URL}?${params}`);
    if (!response.ok) throw new Error(`ACLED feil: ${response.status}`);

    const json = await response.json();
    const data: unknown[] = json?.data ?? [];

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
    }).filter(ev => Number.isFinite(ev.lat) && Number.isFinite(ev.lon));
}
