import * as admin from 'firebase-admin';
import { CURRENT_ENTITY_SCHEMA, RETENTION_DAYS, bucketKey } from './schemaVersion';
import { fetchAllFlights } from './sources/flights';
import { fetchAllShips } from './sources/ships';
import { fetchDisasters, fetchNews } from './sources/events';

function db() {
    return admin.firestore();
}

function expiresAt(ts: number): admin.firestore.Timestamp {
    return admin.firestore.Timestamp.fromMillis(ts + RETENTION_DAYS * 86_400_000);
}

async function killSwitchOn(): Promise<boolean> {
    try {
        const snap = await db().doc('config/killSwitch').get();
        return snap.exists && snap.data()?.disabled === true;
    } catch {
        return false;
    }
}

async function writeBucket(entityType: string, items: unknown[], bucketMinutes: number) {
    if (await killSwitchOn()) {
        console.log(`[${entityType}] kill-switch aktiv, hopper over`);
        return;
    }
    const ts = Date.now();
    const key = bucketKey(ts, bucketMinutes);
    const ref = db().collection('entities').doc(entityType).collection('buckets').doc(key);
    await ref.set({
        ts,
        schemaVersion: CURRENT_ENTITY_SCHEMA,
        expiresAt: expiresAt(ts),
        items,
        count: items.length,
    });
    console.log(`[${entityType}] wrote bucket ${key} with ${items.length} items`);
}

export async function runFlightsSnapshot(): Promise<void> {
    console.log('[flights] starter snapshot');
    const items = await fetchAllFlights();
    console.log(`[flights] hentet ${items.length} fly`);
    await writeBucket('flight', items, 10);
}

export async function runShipsSnapshot(apiKey: string): Promise<void> {
    console.log('[ships] starter snapshot (30s vindu)');
    const items = await fetchAllShips(apiKey);
    console.log(`[ships] hentet ${items.length} skip`);
    await writeBucket('ship', items, 5);
}

export async function runEventsSnapshot(): Promise<void> {
    console.log('[events] starter snapshot');
    const [disasters, news] = await Promise.all([fetchDisasters(), fetchNews()]);
    console.log(`[events] ${disasters.length} disasters, ${news.length} news`);
    await Promise.all([
        writeBucket('disaster', disasters, 10),
        writeBucket('news', news, 10),
    ]);
}
