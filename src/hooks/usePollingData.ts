import { useState, useEffect, useRef, useCallback } from 'react';

interface PollingResult<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
    lastUpdated: number | null;
    refresh: () => void;
}

export function usePollingData<T>(
    fetchFn: () => Promise<T>,
    intervalMs: number,
    enabled: boolean = true
): PollingResult<T> {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);
    const fetchRef = useRef(fetchFn);
    fetchRef.current = fetchFn;

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

        doFetch();
        const id = setInterval(doFetch, intervalMs);
        return () => clearInterval(id);
    }, [enabled, intervalMs, doFetch]);

    return { data, loading, error, lastUpdated, refresh: doFetch };
}
