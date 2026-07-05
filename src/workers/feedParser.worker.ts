/// <reference lib="webworker" />
// Web worker som henter og parser store JSON-feeds (GDELT/ACLED) utenfor
// main thread. response.json() + objektbygging for ~2000 elementer blokkerte
// tidligere Cesium-renderløkka ved hver poll.

import { parseGdelt, parseAcled } from '@/utils/feedParsers';

export interface FeedRequest {
    id: number;
    kind: 'gdelt' | 'acled';
    url: string;
    timeoutMs: number;
}

export interface FeedResponse {
    id: number;
    ok: boolean;
    data?: unknown;
    error?: string;
}

self.onmessage = async (e: MessageEvent<FeedRequest>) => {
    const { id, kind, url, timeoutMs } = e.data;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const data = kind === 'gdelt' ? parseGdelt(json) : parseAcled(json);
        (self as unknown as Worker).postMessage({ id, ok: true, data } satisfies FeedResponse);
    } catch (err) {
        (self as unknown as Worker).postMessage({
            id,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
        } satisfies FeedResponse);
    }
};
