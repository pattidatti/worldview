import { useState, useEffect, useRef, useCallback } from 'react';

interface PollingResult<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
    lastUpdated: number | null;
    refresh: () => void;
}

interface PollingOptions {
    /**
     * Sprer startup-tidspunktet for flere lag med opptil denne mengden ms (jittered).
     * Unngår at alle synlige lag fyrer nettverkskall i samme tick.
     */
    startupJitterMs?: number;
}

export function usePollingData<T>(
    fetchFn: () => Promise<T>,
    intervalMs: number,
    enabled: boolean = true,
    options: PollingOptions = {}
): PollingResult<T> {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);
    const fetchRef = useRef(fetchFn);
    fetchRef.current = fetchFn;
    // Default ~1.5s jitter sprer første fetch for 11 polling-lag så de ikke alle
    // treffer nettverket i samme tick når appen lastes. Konsumenter kan overstyre.
    const { startupJitterMs = 1500 } = options;

    const doFetch = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await fetchRef.current();
            setData(result);
            setLastUpdated(Date.now());
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Ukjent feil');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!enabled) return;
        let intervalId: ReturnType<typeof setInterval> | null = null;
        const jitter = startupJitterMs > 0 ? Math.random() * startupJitterMs : 0;
        const startTimeout = setTimeout(() => {
            doFetch();
            intervalId = setInterval(doFetch, intervalMs);
        }, jitter);
        return () => {
            clearTimeout(startTimeout);
            if (intervalId !== null) clearInterval(intervalId);
        };
    }, [enabled, intervalMs, doFetch, startupJitterMs]);

    return { data, loading, error, lastUpdated, refresh: doFetch };
}
