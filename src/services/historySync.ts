import {
    collection,
    doc,
    getDocs,
    orderBy,
    query,
    setDoc,
    where,
    writeBatch,
} from 'firebase/firestore';
import { db, isKillSwitchActive } from './firestore';
import { HISTORY_SCHEMA_VERSION, type Snapshot, type SnapshotDoc } from '@/types/history';

const RETENTION_DAYS = 30;

function dayKeyUTC(ts: number): string {
    const d = new Date(ts);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}_UTC`;
}

function epochMinute(ts: number): number {
    return Math.floor(ts / 60_000);
}

export async function writeSnapshotBatch(snapshots: Snapshot[]): Promise<void> {
    if (!db || snapshots.length === 0) return;
    if (isKillSwitchActive()) return;
    // Grupper per dag (Firestore batch-grense 500 writes).
    const byDay = new Map<string, Snapshot[]>();
    for (const s of snapshots) {
        const key = dayKeyUTC(s.ts);
        if (!byDay.has(key)) byDay.set(key, []);
        byDay.get(key)!.push(s);
    }
    for (const [day, daySnaps] of byDay) {
        const batch = writeBatch(db);
        for (const s of daySnaps) {
            const expiresAt = new Date(s.ts + RETENTION_DAYS * 86_400_000);
            const payload: SnapshotDoc = {
                ts: s.ts,
                schemaVersion: HISTORY_SCHEMA_VERSION,
                expiresAt,
                counts: s.counts,
            };
            const ref = doc(db, 'snapshots', day, 'entries', String(epochMinute(s.ts)));
            batch.set(ref, payload);
        }
        try {
            await batch.commit();
        } catch (e) {
            console.warn('[historySync] batch commit feilet', e);
        }
    }
}

export async function writeSingleSnapshot(snapshot: Snapshot): Promise<void> {
    if (!db) return;
    if (isKillSwitchActive()) return;
    const day = dayKeyUTC(snapshot.ts);
    const expiresAt = new Date(snapshot.ts + RETENTION_DAYS * 86_400_000);
    const payload: SnapshotDoc = {
        ts: snapshot.ts,
        schemaVersion: HISTORY_SCHEMA_VERSION,
        expiresAt,
        counts: snapshot.counts,
    };
    const ref = doc(db, 'snapshots', day, 'entries', String(epochMinute(snapshot.ts)));
    try {
        await setDoc(ref, payload);
    } catch (e) {
        console.warn('[historySync] write feilet', e);
    }
}

export async function readRange(fromTs: number, toTs: number): Promise<Snapshot[]> {
    if (!db) return [];
    const result: Snapshot[] = [];
    // Iterér dagene i range og les hver dag sin /entries.
    const firstDay = new Date(fromTs);
    firstDay.setUTCHours(0, 0, 0, 0);
    const lastDay = new Date(toTs);
    lastDay.setUTCHours(0, 0, 0, 0);
    for (let d = firstDay.getTime(); d <= lastDay.getTime(); d += 86_400_000) {
        const day = dayKeyUTC(d);
        try {
            const col = collection(db, 'snapshots', day, 'entries');
            const q = query(col, where('ts', '>=', fromTs), where('ts', '<=', toTs), orderBy('ts', 'asc'));
            const snap = await getDocs(q);
            snap.forEach((docSnap) => {
                const data = docSnap.data() as SnapshotDoc;
                result.push({ ts: data.ts, counts: data.counts });
            });
        } catch (e) {
            // Tomt eller feil — fortsett
            console.warn(`[historySync] readRange day ${day} feilet`, e);
        }
    }
    return result;
}
