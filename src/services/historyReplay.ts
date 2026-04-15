// Klient-side lesing av entity-snapshots fra Firestore.
// Struktur: /entities/{type}/buckets/{YYYY-MM-DD_UTC}_{bucketIdx}
// Writes gjøres kun av Cloud Function via admin SDK.

import { doc, getDoc } from 'firebase/firestore';
import { db } from './firestore';
import {
    bucketKey,
    bucketStart,
    type ReplayBucket,
    type ReplayEntityType,
    type ReplayItem,
} from '@/types/replay';
import { entityMigrators } from '@/utils/schemaMigrators';

interface EntityBucketDoc {
    ts: number;
    schemaVersion: number;
    items: ReplayItem[];
    count: number;
}

// Henter bucket som inneholder gitt ts. Returnerer null hvis doc mangler eller
// schema er ukjent (migrator hopper over).
export async function fetchEntityBucket(
    type: ReplayEntityType,
    ts: number,
): Promise<ReplayBucket | null> {
    if (!db) return null;
    const bucketTs = bucketStart(ts, type);
    const key = bucketKey(bucketTs, type);
    try {
        const ref = doc(db, 'entities', type, 'buckets', key);
        const snap = await getDoc(ref);
        if (!snap.exists()) return null;
        const raw = snap.data();
        const migrated = entityMigrators.migrate(raw) as EntityBucketDoc | null;
        if (!migrated) return null;
        return {
            ts: migrated.ts ?? bucketTs,
            items: migrated.items ?? [],
        };
    } catch (e) {
        console.warn(`[historyReplay] fetch feilet ${type} ${key}`, e);
        return null;
    }
}
