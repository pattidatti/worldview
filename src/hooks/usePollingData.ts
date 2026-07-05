import { useState, useEffect, useRef, useCallback } from 'react';
import { useCinematic } from '@/context/CinematicContext';

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
    fetchFn: (signal?: AbortSignal) => Promise<T>,
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
    const { cinematicActiveRef } = useCinematic();
    // In-flight-vern: uten dette starter intervallet en ny fetch oppå en treg
    // pågående en, og requests stables ved nettverkstrøbbel.
    const inFlightRef = useRef(false);
    // Abort ved unmount/disable — hindrer at svar setter state etter opprydding
    // og at forlatte requests fortsetter å bruke båndbredde.
    const abortRef = useRef<AbortController | null>(null);
    const disposedRef = useRef(false);
    // Default ~1.5s jitter sprer første fetch for 11 polling-lag så de ikke alle
    // treffer nettverket i samme tick når appen lastes. Konsumenter kan overstyre.
    const { startupJitterMs = 1500 } = options;

    const doFetch = useCallback(async () => {
        // Skip nettverk + entity-sync når cinematic-tour kjører.
        // Manuell refresh-kall (etter unmount) går igjennom som vanlig.
        if (cinematicActiveRef.current) return;
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        const controller = new AbortController();
        abortRef.current = controller;
        setLoading(true);
        setError(null);
        try {
            const result = await fetchRef.current(controller.signal);
            if (disposedRef.current || controller.signal.aborted) return;
            setData(result);
            setLastUpdated(Date.now());
        } catch (e) {
            if (disposedRef.current || controller.signal.aborted) return;
            setError(e instanceof Error ? e.message : 'Ukjent feil');
        } finally {
            inFlightRef.current = false;
            if (!disposedRef.current && !controller.signal.aborted) setLoading(false);
        }
    }, [cinematicActiveRef]);

    useEffect(() => {
        if (!enabled) return;
        disposedRef.current = false;
        let intervalId: ReturnType<typeof setInterval> | null = null;
        const jitter = startupJitterMs > 0 ? Math.random() * startupJitterMs : 0;
        const startTimeout = setTimeout(() => {
            doFetch();
            intervalId = setInterval(doFetch, intervalMs);
        }, jitter);
        return () => {
            disposedRef.current = true;
            clearTimeout(startTimeout);
            if (intervalId !== null) clearInterval(intervalId);
            abortRef.current?.abort();
            inFlightRef.current = false;
        };
    }, [enabled, intervalMs, doFetch, startupJitterMs]);

    return { data, loading, error, lastUpdated, refresh: doFetch };
}
