// Schema-versjon for alle Firestore-writes fra Cloud Functions.
// Holdes manuelt i sync med src/utils/schemaMigrators.ts på klient-siden.
export const CURRENT_ENTITY_SCHEMA = 1;

export const RETENTION_DAYS = 30;

export function dayKeyUTC(ts: number): string {
    const d = new Date(ts);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}_UTC`;
}

// 10-min bucket (0..143) innenfor en UTC-dag.
export function bucketOfDay(ts: number, bucketMinutes = 10): number {
    const d = new Date(ts);
    const minutesIntoDay = d.getUTCHours() * 60 + d.getUTCMinutes();
    return Math.floor(minutesIntoDay / bucketMinutes);
}

export function bucketKey(ts: number, bucketMinutes = 10): string {
    return `${dayKeyUTC(ts)}_${String(bucketOfDay(ts, bucketMinutes)).padStart(3, '0')}`;
}
