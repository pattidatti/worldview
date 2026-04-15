import { useMemo } from 'react';
import { useHistory } from '@/context/HistoryContext';
import type { LayerId } from '@/types/layers';

interface RollingStats {
    current: number;
    avg1h: number | null;
    avg24h: number | null;
    avg7d: number | null;
    delta1h: number | null;
    delta24h: number | null;
    delta7d: number | null;
    samples: Array<{ ts: number; count: number }>;
    hasBaseline: boolean;
}

const H1 = 3600_000;
const H24 = 86_400_000;
const D7 = 7 * 86_400_000;
const LEADING_EDGE_EXCLUDE_MS = 5 * 60_000;

function mean(values: number[]): number | null {
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

export function useRollingStats(layerId: LayerId): RollingStats {
    const { snapshots } = useHistory();

    return useMemo(() => {
        const now = Date.now();
        const leadingEdgeCutoff = now - LEADING_EDGE_EXCLUDE_MS;

        const samples = snapshots.map((s) => ({
            ts: s.ts,
            count: s.counts[layerId] ?? 0,
        }));

        const current = samples.length > 0 ? samples[samples.length - 1].count : 0;

        const in1h = samples.filter((s) => s.ts >= now - H1 && s.ts < leadingEdgeCutoff).map((s) => s.count);
        const in24h = samples.filter((s) => s.ts >= now - H24 && s.ts < leadingEdgeCutoff).map((s) => s.count);
        const in7d = samples.filter((s) => s.ts >= now - D7 && s.ts < now - 60 * 60_000).map((s) => s.count);

        const avg1h = mean(in1h);
        const avg24h = mean(in24h);
        const avg7d = mean(in7d);

        const delta = (avg: number | null) => (avg == null ? null : current - avg);

        return {
            current,
            avg1h, avg24h, avg7d,
            delta1h: delta(avg1h),
            delta24h: delta(avg24h),
            delta7d: delta(avg7d),
            samples,
            hasBaseline: in1h.length >= 1,
        };
    }, [snapshots, layerId]);
}
