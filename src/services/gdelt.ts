import { type NewsEvent } from '@/types/news';
import { proxied } from '@/utils/corsProxy';
import { combineSignals, throwIfRateLimited } from '@/utils/http';
import { parseGdelt } from '@/utils/feedParsers';
import { fetchAndParseInWorker } from '@/utils/feedWorkerClient';

const GDELT_URL =
    'https://api.gdeltproject.org/api/v2/geo/geo?query=*&mode=PointData&format=GeoJSON&timespan=60min';

const TIMEOUT_MS = 20_000;

export async function fetchNewsEvents(signal?: AbortSignal): Promise<NewsEvent[]> {
    const url = proxied(GDELT_URL);

    // Fetch + parse av opptil 2000 features skjer i web worker — blokkerer
    // ikke Cesium-renderløkka. Fallback til main thread hvis workers mangler.
    const viaWorker = fetchAndParseInWorker<NewsEvent[]>('gdelt', url, TIMEOUT_MS, signal);
    if (viaWorker) return viaWorker;

    const response = await fetch(url, { signal: combineSignals(TIMEOUT_MS, signal) });
    // GDELT deler kvote på tvers av alle API-er og svarer 429 m/ Retry-After.
    // (Gjelder main-thread-grenen; worker-grenen har egen feilhåndtering.)
    throwIfRateLimited(response, 'GDELT');
    if (!response.ok) throw new Error(`GDELT feil: ${response.status}`);
    return parseGdelt(await response.json());
}
