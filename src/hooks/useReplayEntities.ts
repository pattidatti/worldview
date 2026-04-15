// Hook som driver fly/skip i replay-modus.
// - Holder prev + next buckets rundt cursor-tid.
// - Interpolerer posisjoner til cursor.
// - Returnerer også trails = siste N buckets før cursor (cached).
// - Detekterer data-gaps (manglende buckets) og flusher til TimelineEventContext.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
    bucketIntervalMs,
    bucketStart,
    type ReplayBucket,
    type ReplayEntityType,
    type ReplayFlight,
    type ReplayShip,
} from '@/types/replay';
import { fetchEntityBucket } from '@/services/historyReplay';
import { cacheGet, cacheHas, cachePut } from '@/utils/historyCache';
import { interpolateFlights, interpolateShips } from '@/utils/entityInterpolation';
import { useTimelineEvents } from '@/context/TimelineEventContext';
import type { DataGapEvent } from '@/types/timeline-event';

const TRAIL_BUCKET_COUNT = 6; // 60 min ved 10-min fly-buckets, 30 min ved 5-min skip.

// Pre-cast hjelper-typer; interpolations-koden strict-krever type.
type TypedBucket = ReplayBucket<ReplayFlight> | ReplayBucket<ReplayShip>;

async function ensureBucket(
    type: ReplayEntityType,
    bucketTs: number,
): Promise<ReplayBucket | null> {
    if (cacheHas(type, bucketTs)) return cacheGet(type, bucketTs);
    const fetched = await fetchEntityBucket(type, bucketTs);
    if (fetched) {
        cachePut(type, bucketTs, fetched);
        return fetched;
    }
    // Marker miss i cache med tom bucket så vi ikke re-fetcher umiddelbart.
    const empty: ReplayBucket = { ts: bucketTs, items: [] };
    cachePut(type, bucketTs, empty);
    return empty;
}

export interface ReplayEntitiesResult<T> {
    entities: T[];
    trails: ReplayBucket<T>[];
    loading: boolean;
}

export function useReplayEntities(
    type: 'flight',
    cursorTs: number,
): ReplayEntitiesResult<ReplayFlight>;
export function useReplayEntities(
    type: 'ship',
    cursorTs: number,
): ReplayEntitiesResult<ReplayShip>;
export function useReplayEntities(
    type: ReplayEntityType,
    cursorTs: number,
): ReplayEntitiesResult<ReplayFlight | ReplayShip> {
    const [entities, setEntities] = useState<Array<ReplayFlight | ReplayShip>>([]);
    const [trails, setTrails] = useState<TypedBucket[]>([]);
    const [loading, setLoading] = useState(false);

    const { append } = useTimelineEvents();
    const lastGapKeyRef = useRef<string | null>(null);

    const interval = bucketIntervalMs(type);
    const prevTs = bucketStart(cursorTs, type);
    const nextTs = prevTs + interval;

    useEffect(() => {
        let cancelled = false;
        setLoading(true);

        const run = async () => {
            // Hent prev + next parallelt.
            const [prev, next] = await Promise.all([
                ensureBucket(type, prevTs),
                ensureBucket(type, nextTs),
            ]);
            if (cancelled) return;

            // Data-gap: hvis begge er tomme og vi forventet data (cursor innenfor range hvor Cloud Function var aktiv).
            if (prev && next && prev.items.length === 0 && next.items.length === 0) {
                const gapKey = `${type}-${prevTs}`;
                if (lastGapKeyRef.current !== gapKey) {
                    lastGapKeyRef.current = gapKey;
                    const ev: DataGapEvent = {
                        kind: 'data-gap',
                        id: `gap-${type}-${prevTs}`,
                        timestamp: prevTs,
                        layerId: type === 'flight' ? 'flights' : 'ships',
                        fromTs: prevTs,
                        toTs: nextTs,
                    };
                    append(ev);
                }
            }

            let interpolated: Array<ReplayFlight | ReplayShip> = [];
            if (prev && next) {
                if (type === 'flight') {
                    interpolated = interpolateFlights(
                        prev as ReplayBucket<ReplayFlight>,
                        next as ReplayBucket<ReplayFlight>,
                        cursorTs,
                    );
                } else {
                    interpolated = interpolateShips(
                        prev as ReplayBucket<ReplayShip>,
                        next as ReplayBucket<ReplayShip>,
                        cursorTs,
                    );
                }
            } else if (prev) {
                interpolated = prev.items;
            }

            // Trails: siste TRAIL_BUCKET_COUNT buckets før cursor.
            const trailBuckets: TypedBucket[] = [];
            for (let i = TRAIL_BUCKET_COUNT; i >= 0; i--) {
                const ts = prevTs - i * interval;
                const cached = cacheGet(type, ts);
                if (cached) trailBuckets.push(cached as TypedBucket);
            }

            if (!cancelled) {
                setEntities(interpolated);
                setTrails(trailBuckets);
                setLoading(false);
            }
        };

        void run();
        return () => { cancelled = true; };
    }, [type, cursorTs, prevTs, nextTs, interval, append]);

    // Prefetch trail-buckets i bakgrunnen hvis de mangler i cache (ikke-blokkerende).
    useEffect(() => {
        let cancelled = false;
        const prefetch = async () => {
            for (let i = 1; i <= TRAIL_BUCKET_COUNT; i++) {
                if (cancelled) return;
                const ts = prevTs - i * interval;
                if (!cacheHas(type, ts)) {
                    await ensureBucket(type, ts);
                }
            }
        };
        void prefetch();
        return () => { cancelled = true; };
    }, [type, prevTs, interval]);

    return useMemo(
        () => ({ entities, trails, loading }),
        [entities, trails, loading],
    );
}
