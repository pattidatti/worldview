/// <reference lib="webworker" />
// Stateful kanal-worker (jf. docs/ARCHITECTURE-VISION.md, dataplanet): holder
// sesjoner per kanal-id med egen poll-syklus og dead-reckoning-løkke, og
// poster posisjonsbuffere som transferable Float64Array til main thread.
//
// Bevisst adskilt fra feedParser.worker.ts: den er statuløs request/response
// for GDELT/ACLED, og en feil i kanal-koden skal ikke deaktivere feed-parsing
// (workerBroken-flagget i RPC-klienten er permanent).

import { PollScheduler } from '@/data/PollScheduler';
import { FlightSessionCore } from '@/data/channels/flightSessionCore';
import {
    toFlightEntity,
    FLIGHT_DR_INTERVAL_MS,
    type FlightsRequest,
    type FlightsStartMsg,
    type FlightsDeltaPush,
    type FlightsPositionsPush,
    type FlightsStatusPush,
} from '@/data/channels/flightProtocol';
import { fetchFlights } from '@/services/airplaneslive';
import { generateMockFlights } from '@/data/channels/flightMock';
import type { Viewport } from '@/core/ViewportService';

// ---- Meldingstyper (importeres type-only fra main thread) ----

export interface ChannelPingRequest {
    rpcId: number;
    type: 'ping';
}

export interface ChannelDisposeRequest {
    rpcId: number;
    type: 'dispose';
}

export type ChannelWorkerRequest = ChannelPingRequest | ChannelDisposeRequest | FlightsRequest;

export interface ChannelPongResponse {
    rpcId: number;
    ok: true;
    type: 'pong';
}

export interface ChannelErrorResponse {
    rpcId?: number;
    ok: false;
    error: string;
}

export type ChannelWorkerResponse = ChannelPongResponse | ChannelErrorResponse;

// ---- Sesjonsholder ----

export interface ChannelSession {
    dispose(): void;
}

const sessions = new Map<string, ChannelSession>();

function registerSession(id: string, session: ChannelSession): void {
    sessions.get(id)?.dispose();
    sessions.set(id, session);
}

function disposeSession(id: string): void {
    sessions.get(id)?.dispose();
    sessions.delete(id);
}

function disposeAll(): void {
    for (const session of sessions.values()) session.dispose();
    sessions.clear();
}

const scope = self as unknown as Worker;

// ---- Flights-sesjon ----

/** Maks buffere i ping-pong-poolen; tom pool → alloker nytt (aldri deadlock). */
const BUFFER_POOL_MAX = 2;

class FlightsWorkerSession implements ChannelSession {
    private core = new FlightSessionCore();
    private scheduler: PollScheduler;
    private drTimer: ReturnType<typeof setInterval>;
    private viewport: Viewport | null;
    private paused = false;
    private pool: ArrayBuffer[] = [];

    constructor(msg: FlightsStartMsg) {
        this.viewport = msg.viewport;
        const startedMs = Date.now();
        this.scheduler = new PollScheduler(
            async (signal) => {
                const flights = msg.mock
                    ? generateMockFlights((Date.now() - startedMs) / 1000)
                    : await fetchFlights(this.viewport, signal);
                if (signal.aborted) return;
                const result = this.core.ingest(flights.map(toFlightEntity), Date.now());
                scope.postMessage({
                    type: 'flights/delta',
                    upserts: result.upserts,
                    removes: result.removes,
                    roster: result.roster,
                } satisfies FlightsDeltaPush);
            },
            {
                intervalMs: msg.pollMs,
                // Jitter er unødvendig her — kanalen startes eksplisitt av laget
                startupJitterMs: 0,
                isPaused: () => this.paused,
                onStatus: (s) =>
                    scope.postMessage({ type: 'flights/status', ...s } satisfies FlightsStatusPush),
            },
        );
        this.scheduler.start();
        this.drTimer = setInterval(() => this.tickDr(), FLIGHT_DR_INTERVAL_MS);
    }

    setViewport(vp: Viewport): void {
        this.viewport = vp;
        this.scheduler.refresh();
    }

    setPaused(paused: boolean): void {
        this.paused = paused;
    }

    returnBuffer(buffer: ArrayBuffer): void {
        if (this.pool.length < BUFFER_POOL_MAX) this.pool.push(buffer);
    }

    dispose(): void {
        this.scheduler.stop();
        clearInterval(this.drTimer);
        this.core.clear();
        this.pool = [];
    }

    private tickDr(): void {
        if (this.paused || this.core.size === 0) return;
        const reuse = this.pool.pop();
        const { buffer, moved } = this.core.buildPositions(
            Date.now(),
            reuse ? new Float64Array(reuse) : null,
        );
        scope.postMessage(
            {
                type: 'flights/positions',
                buffer: buffer.buffer,
                count: this.core.size,
                moved,
            } satisfies FlightsPositionsPush,
            [buffer.buffer],
        );
    }
}

function getFlightsSession(): FlightsWorkerSession | undefined {
    return sessions.get('flights') as FlightsWorkerSession | undefined;
}

// ---- Meldingsløkke ----

scope.onmessage = (e: MessageEvent<ChannelWorkerRequest>) => {
    const msg = e.data;
    try {
        switch (msg.type) {
            case 'ping':
                scope.postMessage({ rpcId: msg.rpcId, ok: true, type: 'pong' } satisfies ChannelPongResponse);
                break;
            case 'dispose':
                disposeAll();
                scope.postMessage({ rpcId: msg.rpcId, ok: true, type: 'pong' } satisfies ChannelPongResponse);
                break;
            case 'flights/start':
                registerSession('flights', new FlightsWorkerSession(msg));
                break;
            case 'flights/stop':
                disposeSession('flights');
                break;
            case 'flights/viewport':
                getFlightsSession()?.setViewport(msg.viewport);
                break;
            case 'flights/pause':
                getFlightsSession()?.setPaused(msg.paused);
                break;
            case 'flights/bufferReturn':
                getFlightsSession()?.returnBuffer(msg.buffer);
                break;
        }
    } catch (err) {
        scope.postMessage({
            rpcId: 'rpcId' in msg ? msg.rpcId : undefined,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
        } satisfies ChannelErrorResponse);
    }
};
