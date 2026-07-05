// Klient-side skriving av gate-crossings til Firestore.
// Kalles fra FlightLayer/ShipLayer etter appendEventsRef i TimelineEventContext.
// Idempotent via deterministisk doc-ID (gateId:entityId:segmentIndex:tsMinute).
//
// Merk: event.id bruker millisekunder i detectEntityCrossings, men vi bucketer
// doc-ID på minutt-granularitet for å unngå duplikater når samme fly krysser
// samme segment to ganger i samme minutt pga. støy.

import { Timestamp, doc, writeBatch } from 'firebase/firestore';
import { db, isKillSwitchActive } from './firestore';
import type { GateCrossingEvent } from '@/types/timeline-event';

const CROSSING_SCHEMA_VERSION = 1;
const RETENTION_DAYS = 30;

function dayKeyUTC(ts: number): string {
    const d = new Date(ts);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}_UTC`;
}

function docId(ev: GateCrossingEvent): string {
    const tsMinute = Math.floor(ev.timestamp / 60_000);
    return `${ev.gateId}_${ev.entityId}_${ev.segmentIndex}_${tsMinute}`;
}

export async function writeCrossings(events: GateCrossingEvent[]): Promise<void> {
    if (!db || events.length === 0) return;
    if (isKillSwitchActive()) return;

    // writeBatch i stedet for N parallelle setDoc — én roundtrip per poll.
    // Firestore-grensen er 500 writes per batch; chunk godt under den.
    for (let i = 0; i < events.length; i += 450) {
        const chunk = events.slice(i, i + 450);
        const batch = writeBatch(db);
        for (const ev of chunk) {
            const day = dayKeyUTC(ev.timestamp);
            const id = docId(ev);
            const ref = doc(db, 'gate_crossings', day, 'events', id);
            const expiresAt = Timestamp.fromMillis(ev.timestamp + RETENTION_DAYS * 86_400_000);
            batch.set(ref, {
                ts: ev.timestamp,
                schemaVersion: CROSSING_SCHEMA_VERSION,
                expiresAt,
                gateId: ev.gateId,
                entityId: ev.entityId,
                entityType: ev.entityType,
                segmentIndex: ev.segmentIndex,
                direction: ev.direction,
                position: ev.position,
            }); // idempotent — samme ID = overskrives identisk
        }
        try {
            await batch.commit();
        } catch (e) {
            // En feilet batch skal ikke stoppe resten — logg og fortsett.
            console.warn('[crossingSync] batch write feilet', e);
        }
    }
}
