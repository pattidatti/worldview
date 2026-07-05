/**
 * fetch-wrapper med timeout og valgfri ekstern AbortSignal.
 * De fleste tjenestene manglet begge deler — et hengende API-kall kunne
 * blokkere polling-løkka på ubestemt tid og fullførte etter unmount.
 */
export const DEFAULT_TIMEOUT_MS = 15_000;

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
