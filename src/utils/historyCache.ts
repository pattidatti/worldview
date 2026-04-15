// LRU in-memory cache for entity-buckets lest fra Firestore.
// Nøkkel: `${entityType}:${bucketTs}`. Cap 48 = ~8t ved 10-min fly-buckets.

import type { ReplayBucket, ReplayEntityType, ReplayItem } from '@/types/replay';

const CAPACITY = 48;

const cache = new Map<string, ReplayBucket>();

function key(type: ReplayEntityType, bucketTs: number): string {
    return `${type}:${bucketTs}`;
}

export function cacheGet(type: ReplayEntityType, bucketTs: number): ReplayBucket | null {
    const k = key(type, bucketTs);
    const val = cache.get(k);
    if (!val) return null;
    // Flytt til "most recently used" — delete + set.
    cache.delete(k);
    cache.set(k, val);
    return val;
}

export function cacheHas(type: ReplayEntityType, bucketTs: number): boolean {
    return cache.has(key(type, bucketTs));
}

export function cachePut(type: ReplayEntityType, bucketTs: number, bucket: ReplayBucket): void {
    const k = key(type, bucketTs);
    if (cache.has(k)) cache.delete(k);
    cache.set(k, bucket);
    while (cache.size > CAPACITY) {
        // Slett eldste entry.
        const first = cache.keys().next().value;
        if (first) cache.delete(first);
    }
}

// Bruk for testing / reset ved logout.
export function cacheClear(): void {
    cache.clear();
}

// Hent alle bucket-ts for gitt type som er innenfor [fromTs, toTs], sortert stigende.
export function cacheListInRange(type: ReplayEntityType, fromTs: number, toTs: number): Array<ReplayBucket<ReplayItem>> {
    const result: ReplayBucket[] = [];
    for (const [k, v] of cache) {
        if (!k.startsWith(`${type}:`)) continue;
        if (v.ts >= fromTs && v.ts <= toTs) result.push(v);
    }
    result.sort((a, b) => a.ts - b.ts);
    return result;
}
