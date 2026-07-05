import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { useLayerStore } from '@/store/layerStore';
import { useAuth } from './AuthContext';
import type { Snapshot } from '@/types/history';
import type { LayerId } from '@/types/layers';
import { readRange, writeSnapshotBatch } from '@/services/historySync';

const SNAPSHOT_INTERVAL_MS = 60_000; // 60s rolling buffer
const BATCH_FLUSH_MS = 5 * 60_000; // 5-min Firestore batch write
const MAX_SAMPLES = 10_080; // 7 dager × 1440 min
// Boot-restore leser kun siste 24t (~1 440 docs). Full 7d-backfill (~10 000
// docs) kostet ~10k Firestore-reads ved HVER innloggede app-start — nå lastes
// resten kun på forespørsel (ensureFullBackfill) når analysepanelet trenger
// 7d-statistikk.
const BOOT_BACKFILL_MS = 86_400_000; // 24t
const FULL_BACKFILL_MS = 7 * 86_400_000; // 7d on-demand
const MAX_PENDING = 1440; // cap retry-buffer ved gjentatte flush-feil (~24t)

interface HistoryContextValue {
    snapshots: Snapshot[];
    loading: boolean;
    error: string | null;
    latest: Snapshot | null;
    /** Last inn full 7d-historikk (idempotent). Kalles av analysepaneler som trenger 7d-vinduet. */
    ensureFullBackfill: () => void;
}

const HistoryContext = createContext<HistoryContextValue | null>(null);

export function HistoryProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const uid = user?.uid ?? null;

    const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // Les counts direkte fra layer-storen i intervallet — unngår at HistoryProvider
    // re-renders per status-endring.
    const readCountsSnapshot = (): Partial<Record<LayerId, number>> => {
        const status = useLayerStore.getState().status;
        const out: Partial<Record<LayerId, number>> = {};
        for (const [id, s] of Object.entries(status)) {
            out[id as LayerId] = s.count;
        }
        return out;
    };

    // Pending writes (akkumulert mellom 5-min flush).
    const pendingRef = useRef<Snapshot[]>([]);

    // Boot-restore: les kun siste 24t fra Firestore (resten on-demand).
    useEffect(() => {
        if (!uid) return;
        setLoading(true);
        setError(null);
        const now = Date.now();
        readRange(now - BOOT_BACKFILL_MS, now)
            .then((restored) => {
                setSnapshots((prev) => {
                    // Behold evt. nyere samples fra rolling-intervallet.
                    const oldestLive = prev.length > 0 ? prev[0].ts : Infinity;
                    const merged = [...restored.filter((s) => s.ts < oldestLive), ...prev];
                    return merged.slice(-MAX_SAMPLES);
                });
                setLoading(false);
            })
            .catch((e) => {
                console.warn('[HistoryContext] boot-restore feilet', e);
                setError('Historikk utilgjengelig');
                setLoading(false);
            });
    }, [uid]);

    // On-demand full backfill (7d) — trigges av analysepaneler.
    const fullBackfillStartedRef = useRef(false);
    const ensureFullBackfill = useCallback(() => {
        if (!uid || fullBackfillStartedRef.current) return;
        fullBackfillStartedRef.current = true;
        const now = Date.now();
        readRange(now - FULL_BACKFILL_MS, now - BOOT_BACKFILL_MS)
            .then((older) => {
                if (older.length === 0) return;
                setSnapshots((prev) => {
                    const oldestLive = prev.length > 0 ? prev[0].ts : Infinity;
                    const merged = [...older.filter((s) => s.ts < oldestLive), ...prev];
                    return merged.slice(-MAX_SAMPLES);
                });
            })
            .catch((e) => {
                console.warn('[HistoryContext] full backfill feilet', e);
                fullBackfillStartedRef.current = false; // tillat nytt forsøk
            });
    }, [uid]);

    // Rolling 60s snapshot.
    useEffect(() => {
        const id = setInterval(() => {
            const snap: Snapshot = { ts: Date.now(), counts: readCountsSnapshot() };
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
        () => ({ snapshots, loading, error, latest, ensureFullBackfill }),
        [snapshots, loading, error, latest, ensureFullBackfill],
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
