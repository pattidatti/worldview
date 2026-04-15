// Klient-side skriving av gate-crossings til Firestore.
// Kalles fra FlightLayer/ShipLayer etter appendEventsRef i TimelineEventContext.
// Idempotent via deterministisk doc-ID (gateId:entityId:segmentIndex:tsMinute).
//
// Merk: event.id bruker millisekunder i detectEntityCrossings, men vi bucketer
// doc-ID på minutt-granularitet for å unngå duplikater når samme fly krysser
// samme segment to ganger i samme minutt pga. støy.

import { Timestamp, doc, setDoc } from 'firebase/firestore';
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

    const promises = events.map(async (ev) => {
        const day = dayKeyUTC(ev.timestamp);
        const id = docId(ev);
        const ref = doc(db!, 'gate_crossings', day, 'events', id);
        const expiresAt = Timestamp.fromMillis(ev.timestamp + RETENTION_DAYS * 86_400_000);
        try {
            await setDoc(ref, {
                ts: ev.timestamp,
                schemaVersion: CROSSING_SCHEMA_VERSION,
                expiresAt,
                gateId: ev.gateId,
                entityId: ev.entityId,
                entityType: ev.entityType,
                segmentIndex: ev.segmentIndex,
                direction: ev.direction,
                position: ev.position,
            }, { merge: false }); // idempotent — samme ID = overskrives identisk
        } catch (e) {
            // En enkelt feil skal ikke stoppe resten — logg og fortsett.
            console.warn(`[crossingSync] write feilet for ${id}`, e);
        }
    });

    await Promise.all(promises);
}
