import { type ConflictEvent } from '@/types/conflict';
import { combineSignals } from '@/utils/http';
import { parseAcled } from '@/utils/feedParsers';
import { fetchAndParseInWorker } from '@/utils/feedWorkerClient';

const API_KEY = import.meta.env.VITE_ACLED_API_KEY || '';
const EMAIL = import.meta.env.VITE_ACLED_EMAIL || '';
const BASE_URL = 'https://api.acleddata.com/acled/read';

const TIMEOUT_MS = 20_000;

function dateString(d: Date): string {
    return d.toISOString().slice(0, 10);
}

export async function fetchConflicts(signal?: AbortSignal): Promise<ConflictEvent[]> {
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
    const url = `${BASE_URL}?${params}`;

    // Fetch + parse av opptil 2000 rader skjer i web worker — blokkerer ikke
    // Cesium-renderløkka. Fallback til main thread hvis workers mangler.
    const viaWorker = fetchAndParseInWorker<ConflictEvent[]>('acled', url, TIMEOUT_MS, signal);
    if (viaWorker) return viaWorker;

    const response = await fetch(url, { signal: combineSignals(TIMEOUT_MS, signal) });
    if (!response.ok) throw new Error(`ACLED feil: ${response.status}`);
    return parseAcled(await response.json());
}
