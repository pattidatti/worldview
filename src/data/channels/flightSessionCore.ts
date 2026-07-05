// Kjernen i flights-sesjonen: fly-tilstand, delta-diffing og bygging av
// posisjonsbuffer med dead-reckoning. DOM-/Cesium-fri og delt mellom
// channel-workeren og main-thread-fallbacken (når Worker-API mangler) —
// samme kode, samme oppførsel, uansett hvor den kjører.

import { diffMap } from '@/data/DataChannel';
import type { EntityDelta } from '@/core/EntityStore';
import { extrapolateGreatCircle, DR_MAX_AGE_MS } from '@/utils/flightKinematics';
import {
    FLIGHT_BUFFER_LAYOUT,
    FLIGHT_FLAG_MILITARY,
    FLIGHT_FLAG_ON_GROUND,
    FLIGHT_FLAG_STALE,
    type FlightEntity,
} from './flightProtocol';

/** Ikke ekstrapolér ferskere data enn dette — matcher FlightLayers DR-vern. */
const DR_MIN_AGE_MS = 100;

export interface IngestResult extends EntityDelta<FlightEntity> {
    roster: string[];
}

export class FlightSessionCore {
    private flights = new Map<string, FlightEntity>();
    private lastUpdateMs = new Map<string, number>();
    private roster: string[] = [];

    get size(): number {
        return this.flights.size;
    }

    getRoster(): readonly string[] {
        return this.roster;
    }

    /**
     * Ta imot en poll-batch: diff mot forrige tilstand, oppdater intern state
     * og roster. lastUpdateMs refreshes for ALLE fly i batchen (også uendrede)
     * — de rapporterer ferske data selv om posisjonen står stille.
     */
    ingest(items: FlightEntity[], now: number): IngestResult {
        const delta = diffMap(this.flights, items);
        for (const item of items) {
            this.flights.set(item.id, item);
            this.lastUpdateMs.set(item.id, now);
        }
        for (const id of delta.removes) {
            this.flights.delete(id);
            this.lastUpdateMs.delete(id);
        }
        this.roster = [...this.flights.keys()];
        return { ...delta, roster: this.roster };
    }

    clear(): void {
        this.flights.clear();
        this.lastUpdateMs.clear();
        this.roster = [];
    }

    /**
     * Bygg posisjonsbuffer for gjeldende roster (dead-reckoning per fly).
     * Gjenbruker `reuse` hvis den har riktig størrelse (ping-pong-pool);
     * allokerer ellers nytt — degrader til GC-trykk, aldri stopp.
     * `moved` er false når ingen fly faktisk ekstrapolerte (idle-vern:
     * mottaker kan droppe requestRender).
     */
    buildPositions(now: number, reuse?: Float64Array | null): { buffer: Float64Array; moved: boolean } {
        const stride = FLIGHT_BUFFER_LAYOUT.stride;
        const needed = this.roster.length * stride;
        const buffer = reuse && reuse.length === needed ? reuse : new Float64Array(needed);

        let moved = false;
        for (let i = 0; i < this.roster.length; i++) {
            const flight = this.flights.get(this.roster[i])!;
            const ageMs = now - (this.lastUpdateMs.get(flight.id) ?? now);

            let lon = flight.lon;
            let lat = flight.lat;
            let flags = 0;
            if (flight.onGround) flags |= FLIGHT_FLAG_ON_GROUND;
            if (flight.isMilitary) flags |= FLIGHT_FLAG_MILITARY;

            if (ageMs > DR_MAX_AGE_MS) {
                flags |= FLIGHT_FLAG_STALE;
            } else if (ageMs >= DR_MIN_AGE_MS && !flight.onGround && flight.velocity > 0) {
                const p = extrapolateGreatCircle(
                    flight.lon, flight.lat, flight.heading, flight.velocity, ageMs / 1000,
                );
                lon = p.lon;
                lat = p.lat;
                moved = true;
            }

            const base = i * stride;
            buffer[base] = lon;
            buffer[base + 1] = lat;
            buffer[base + 2] = flight.altitude;
            buffer[base + 3] = flight.heading;
            buffer[base + 4] = flight.velocity;
            buffer[base + 5] = flags;
        }
        return { buffer, moved };
    }
}
