/**
 * fetch-wrapper med timeout og valgfri ekstern AbortSignal.
 * De fleste tjenestene manglet begge deler — et hengende API-kall kunne
 * blokkere polling-løkka på ubestemt tid og fullførte etter unmount.
 */
export const DEFAULT_TIMEOUT_MS = 15_000;

/** Kastes ved HTTP 429 slik at pollende lag kan skille rate-limit fra ekte feil. */
export class RateLimitError extends Error {
    readonly retryAfterMs?: number;
    constructor(api: string, retryAfterMs?: number) {
        super(`${api} rate-limited (429)`);
        this.name = 'RateLimitError';
        this.retryAfterMs = retryAfterMs;
    }
}

function parseRetryAfter(value: string | null): number | undefined {
    if (!value) return undefined;
    const secs = Number(value);
    if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
    const date = Date.parse(value);
    return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

/**
 * Kaster RateLimitError (med Retry-After) hvis responsen er 429. No-op ellers.
 * Lar det pollende laget beholde eksisterende data og prøve igjen neste runde
 * i stedet for å hamre API-et. Flere gratis-API-er (Launch Library, NASA, GDELT)
 * svarer 429 ved overforbruk.
 */
export function throwIfRateLimited(res: Response, api: string): void {
    if (res.status !== 429) return;
    const retryAfterMs = parseRetryAfter(res.headers.get('Retry-After'));
    if (import.meta.env.DEV) {
        const hint = retryAfterMs != null ? ` — Retry-After ${Math.round(retryAfterMs / 1000)}s` : '';
        console.warn(`${api} rate-limited (429)${hint}; hopper over pollen`);
    }
    throw new RateLimitError(api, retryAfterMs);
}

export function combineSignals(timeoutMs: number, external?: AbortSignal): AbortSignal {
    const timeout = AbortSignal.timeout(timeoutMs);
    if (!external) return timeout;
    return AbortSignal.any([timeout, external]);
}

export async function fetchJson<T>(
    url: string,
    options: { timeoutMs?: number; signal?: AbortSignal; init?: RequestInit } = {},
): Promise<T> {
    const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, init } = options;
    const response = await fetch(url, {
        ...init,
        signal: combineSignals(timeoutMs, signal),
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} fra ${new URL(url).hostname}`);
    }
    return response.json() as Promise<T>;
}
