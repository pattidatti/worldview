// Delt protokoll for flights-kanalen: meldingstyper mellom main thread og
// channel-workeren, posisjonsbuffer-layout og flagg-bits. DOM-/Cesium-fri.

import type { Flight, PositionSource } from '@/types/flight';
import type { ReplayFlight } from '@/types/replay';
import type { PositionBufferLayout } from '@/core/EntityStore';
import type { Viewport } from '@/core/ViewportService';

/** Flight med EntityStore-id (== icao24). */
export type FlightEntity = Flight & { id: string };

export function toFlightEntity(flight: Flight): FlightEntity {
    return { ...flight, id: flight.icao24 };
}

/**
 * ReplayFlight → FlightEntity. Sentraliserer avstemmingen som tidligere lå
 * ad hoc i FlightLayers replay-effekt: ReplayFlight mangler originCountry og
 * har positionSource som løst tall.
 */
export function replayFlightToFlightEntity(replay: ReplayFlight): FlightEntity {
    const source = replay.positionSource;
    return {
        ...replay,
        id: replay.icao24,
        originCountry: '',
        positionSource: (source === 0 || source === 1 || source === 2 || source === 3
            ? source
            : 0) as PositionSource,
    };
}

/** Posisjonsbuffer: 6 Float64 per fly. */
export const FLIGHT_BUFFER_LAYOUT: PositionBufferLayout = {
    stride: 6,
    fields: ['lon', 'lat', 'alt', 'heading', 'velocity', 'flags'],
};

export const FLIGHT_FLAG_ON_GROUND = 1;
export const FLIGHT_FLAG_MILITARY = 2;
/** DR har stoppet (ingen ferske data på > DR_MAX_AGE_MS). */
export const FLIGHT_FLAG_STALE = 4;

/** Dead-reckoning-kadens — 4 Hz, som FlightLayers gamle main-thread-interval. */
export const FLIGHT_DR_INTERVAL_MS = 250;

// ---- Main thread → worker ----

export interface FlightsStartMsg {
    type: 'flights/start';
    pollMs: number;
    viewport: Viewport | null;
    /** Syntetisk 2000-flys last for ytelsestesting (?flightsMock=1). */
    mock?: boolean;
}

export interface FlightsStopMsg {
    type: 'flights/stop';
}

export interface FlightsViewportMsg {
    type: 'flights/viewport';
    viewport: Viewport;
}

export interface FlightsPauseMsg {
    type: 'flights/pause';
    paused: boolean;
}

/** Ping-pong: main thread returnerer brukt posisjonsbuffer til workerens pool. */
export interface FlightsBufferReturnMsg {
    type: 'flights/bufferReturn';
    buffer: ArrayBuffer;
}

export type FlightsRequest =
    | FlightsStartMsg
    | FlightsStopMsg
    | FlightsViewportMsg
    | FlightsPauseMsg
    | FlightsBufferReturnMsg;

// ---- Worker → main thread (push) ----

export interface FlightsDeltaPush {
    type: 'flights/delta';
    upserts: FlightEntity[];
    removes: string[];
    /** Full slot-rekkefølge for posisjonsbufferen — settes som store-roster. */
    roster: string[];
}

export interface FlightsPositionsPush {
    type: 'flights/positions';
    /** Transferable — wrappes i Float64Array hos mottaker. */
    buffer: ArrayBuffer;
    count: number;
    /** false når ingen fly ekstrapolerte — mottaker kan droppe requestRender. */
    moved: boolean;
}

export interface FlightsStatusPush {
    type: 'flights/status';
    loading: boolean;
    error: string | null;
    lastUpdated: number | null;
}

export type FlightsPush = FlightsDeltaPush | FlightsPositionsPush | FlightsStatusPush;
