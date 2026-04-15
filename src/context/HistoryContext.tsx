import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { useLayers } from './LayerContext';
import { useAuth } from './AuthContext';
import type { Snapshot } from '@/types/history';
import type { LayerId } from '@/types/layers';
import { readRange, writeSnapshotBatch } from '@/services/historySync';

const SNAPSHOT_INTERVAL_MS = 60_000; // 60s rolling buffer
const BATCH_FLUSH_MS = 5 * 60_000; // 5-min Firestore batch write
const MAX_SAMPLES = 10_080; // 7 dager × 1440 min
const BACKFILL_MS = 7 * 86_400_000; // 7d boot-restore
const MAX_PENDING = 1440; // cap retry-buffer ved gjentatte flush-feil (~24t)

interface HistoryContextValue {
    snapshots: Snapshot[];
    loading: boolean;
    error: string | null;
    latest: Snapshot | null;
}

const HistoryContext = createContext<HistoryContextValue | null>(null);

export function HistoryProvider({ children }: { children: ReactNode }) {
    const { layers } = useLayers();
    const { user } = useAuth();
    const uid = user?.uid ?? null;

    const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // Latest counts-ref (hver snapshot leser denne).
    const countsRef = useRef<Partial<Record<LayerId, number>>>({});
    useEffect(() => {
        const next: Partial<Record<LayerId, number>> = {};
        for (const l of layers) next[l.id] = l.count;
        countsRef.current = next;
    }, [layers]);

    // Pending writes (akkumulert mellom 5-min flush).
    const pendingRef = useRef<Snapshot[]>([]);

    // Boot-restore: les siste 7d fra Firestore.
    useEffect(() => {
        if (!uid) return;
        setLoading(true);
        setError(null);
        const now = Date.now();
        readRange(now - BACKFILL_MS, now)
            .then((restored) => {
                setSnapshots(restored.slice(-MAX_SAMPLES));
                setLoading(false);
            })
            .catch((e) => {
                console.warn('[HistoryContext] boot-restore feilet', e);
                setError('Historikk utilgjengelig');
                setLoading(false);
            });
    }, [uid]);

    // Rolling 60s snapshot.
    useEffect(() => {
        const id = setInterval(() => {
            const snap: Snapshot = { ts: Date.now(), counts: { ...countsRef.current } };
            setSnapshots((prev) => {
                const next = [...prev, snap];
                if (next.length > MAX_SAMPLES) next.splice(0, next.length - MAX_SAMPLES);
                return next;
            });
            pendingRef.current.push(snap);
        }, SNAPSHOT_INTERVAL_MS);
        return () => clearInterval(id);
    }, []);

    // Batch-flush til Firestore hvert 5. min (kun når logget inn).
    useEffect(() => {
        if (!uid) return;
        const id = setInterval(() => {
            const pending = pendingRef.current;
            if (pending.length === 0) return;
            pendingRef.current = [];
            writeSnapshotBatch(pending).catch((e) => {
                console.warn('[HistoryContext] flush feilet', e);
                // Legg tilbake så neste flush prøver igjen, men cap for å unngå ubegrenset vekst.
                const merged = [...pending, ...pendingRef.current];
                pendingRef.current = merged.slice(-MAX_PENDING);
            });
        }, BATCH_FLUSH_MS);
        return () => clearInterval(id);
    }, [uid]);

    const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

    const value = useMemo<HistoryContextValue>(
        () => ({ snapshots, loading, error, latest }),
        [snapshots, loading, error, latest],
    );

    return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export function useHistory(): HistoryContextValue {
    const ctx = useContext(HistoryContext);
    if (!ctx) throw new Error('useHistory må brukes inni HistoryProvider');
    return ctx;
}

// Utility: finn siste N samples innenfor gitt tidsvindu.
export function useHistoryWindow(windowMs: number): Snapshot[] {
    const { snapshots } = useHistory();
    return useMemo(() => {
        const cutoff = Date.now() - windowMs;
        return snapshots.filter((s) => s.ts >= cutoff);
    }, [snapshots, windowMs]);
}
