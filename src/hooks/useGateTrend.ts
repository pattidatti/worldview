import { useMemo } from 'react';
import { useTimelineEvents } from '@/context/TimelineEventContext';

interface Bucket {
    ts: number; // bucket start
    count: number;
}

const BUCKET_MS = 15 * 60_000;
const WINDOW_MS = 24 * 60 * 60_000;
const BUCKET_COUNT = WINDOW_MS / BUCKET_MS; // 96

export function useGateTrend(gateId: string): { buckets: Bucket[]; total: number } {
    const { events } = useTimelineEvents();

    return useMemo(() => {
        const now = Date.now();
        const start = now - WINDOW_MS;
        const buckets: Bucket[] = [];
        for (let i = 0; i < BUCKET_COUNT; i++) {
            buckets.push({ ts: start + i * BUCKET_MS, count: 0 });
        }
        let total = 0;
        for (const e of events) {
            if (e.kind !== 'gate-crossing') continue;
            if (e.gateId !== gateId) continue;
            if (e.timestamp < start || e.timestamp > now) continue;
            const idx = Math.floor((e.timestamp - start) / BUCKET_MS);
            if (idx >= 0 && idx < BUCKET_COUNT) {
                buckets[idx].count += 1;
                total += 1;
            }
        }
        return { buckets, total };
    }, [events, gateId]);
}
