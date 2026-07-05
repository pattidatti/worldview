// RPC-klient for feedParser-workeren. Én lazy singleton-worker deles av
// alle feeds. Returnerer null hvis workers ikke er tilgjengelig (eller har
// feilet) — kalleren faller da tilbake til parsing på main thread.

import type { FeedResponse } from '@/workers/feedParser.worker';

type Pending = { resolve: (data: unknown) => void; reject: (err: Error) => void };

let worker: Worker | null = null;
let workerBroken = false;
let seq = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker | null {
    if (workerBroken) return null;
    if (worker) return worker;
    if (typeof Worker === 'undefined') return null;
    try {
        worker = new Worker(
            new URL('../workers/feedParser.worker.ts', import.meta.url),
            { type: 'module' },
        );
        worker.onmessage = (e: MessageEvent<FeedResponse>) => {
            const { id, ok, data, error } = e.data;
            const p = pending.get(id);
            if (!p) return;
            pending.delete(id);
            if (ok) p.resolve(data);
            else p.reject(new Error(error ?? 'Worker-feil'));
        };
        worker.onerror = () => {
            // Workeren lastet/kjørte ikke — avvis alt in-flight og deaktiver
            // permanent slik at senere kall bruker main-thread-fallback.
            workerBroken = true;
            for (const p of pending.values()) p.reject(new Error('feedParser-worker feilet'));
            pending.clear();
            worker?.terminate();
            worker = null;
        };
    } catch {
        workerBroken = true;
        worker = null;
    }
    return worker;
}

export function fetchAndParseInWorker<T>(
    kind: 'gdelt' | 'acled',
    url: string,
    timeoutMs: number,
    signal?: AbortSignal,
): Promise<T> | null {
    const w = getWorker();
    if (!w) return null;
    const id = ++seq;
    return new Promise<T>((resolve, reject) => {
        pending.set(id, { resolve: (d) => resolve(d as T), reject });
        signal?.addEventListener(
            'abort',
            () => {
                if (pending.delete(id)) reject(new DOMException('Avbrutt', 'AbortError'));
            },
            { once: true },
        );
        w.postMessage({ id, kind, url, timeoutMs });
    });
}
