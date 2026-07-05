// Flights-datakanal: eier poll/DR-syklusen (i channel-workeren når mulig,
// main-thread-fallback ellers) og skriver deltaer + posisjonsbuffere inn i
// EntityStore('flights'). Rendereren abonnerer på storen — ingen React her.

import { EntityStore, entityStores } from '@/core/EntityStore';
import type { Viewport } from '@/core/ViewportService';
import type { ChannelStatus, DataChannel } from '@/data/DataChannel';
import { PollScheduler } from '@/data/PollScheduler';
import { channelWorkerRpc } from '@/data/channelWorkerClient';
import { FlightSessionCore } from '@/data/channels/flightSessionCore';
import {
    FLIGHT_BUFFER_LAYOUT,
    FLIGHT_DR_INTERVAL_MS,
    toFlightEntity,
    type FlightEntity,
    type FlightsDeltaPush,
    type FlightsPositionsPush,
    type FlightsStatusPush,
} from '@/data/channels/flightProtocol';
import { fetchFlights } from '@/services/airplaneslive';
import { generateMockFlights } from '@/data/channels/flightMock';
import type { Flight } from '@/types/flight';

/** Delmengden av WorkerRpc kanalen bruker — injiserbar i tester. */
export interface ChannelRpc {
    readonly available: boolean;
    post(msg: object, transfer?: Transferable[]): boolean;
    onPush<TMsg>(type: string, fn: (msg: TMsg) => void): () => void;
}

export interface FlightChannelOptions {
    pollMs?: number;
    rpc?: ChannelRpc | null;
    /** Test-hook; default airplanes.live-fetcheren. */
    fetchFn?: (viewport: Viewport | null, signal: AbortSignal) => Promise<Flight[]>;
    /** Syntetisk 2000-flys last for ytelsestesting (?flightsMock=1). */
    mock?: boolean;
}

const DEFAULT_POLL_MS = 10_000;

export class FlightChannel implements DataChannel<FlightEntity> {
    readonly id = 'flights';
    readonly store: EntityStore<FlightEntity>;

    private readonly pollMs: number;
    private readonly rpc: ChannelRpc | null;
    private readonly fetchFn: (viewport: Viewport | null, signal: AbortSignal) => Promise<Flight[]>;

    private running = false;
    private useWorker = false;
    private viewport: Viewport | null = null;
    private paused = false;

    private pushUnsubs: (() => void)[] = [];
    /** Forrige posisjonsbuffer — returneres til workerens pool når neste ankommer
     *  (dobbel-buffring: storens gjeldende buffer er alltid gyldig). */
    private previousBuffer: ArrayBuffer | null = null;

    private statusSubscribers = new Set<(status: ChannelStatus) => void>();
    private lastStatus: ChannelStatus = { loading: false, error: null, lastUpdated: null, count: 0 };

    // Main-thread-fallback (Worker-API utilgjengelig)
    private fallbackScheduler: PollScheduler | null = null;
    private fallbackDrTimer: ReturnType<typeof setInterval> | null = null;
    private fallbackBuffer: Float64Array | null = null;

    private readonly mock: boolean;
    private startedMs = 0;

    constructor(opts: FlightChannelOptions = {}) {
        this.pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
        this.rpc = opts.rpc === undefined ? channelWorkerRpc : opts.rpc;
        this.mock = opts.mock ?? false;
        this.fetchFn = opts.fetchFn
            ?? (this.mock
                ? async () => generateMockFlights((Date.now() - this.startedMs) / 1000)
                : (vp, signal) => fetchFlights(vp, signal));
        this.store = new EntityStore<FlightEntity>(this.id, FLIGHT_BUFFER_LAYOUT);
        entityStores.register(this.store);
    }

    start(): void {
        if (this.running) return;
        this.running = true;
        this.startedMs = Date.now();
        this.useWorker = this.startWorker();
        if (!this.useWorker) this.startFallback();
    }

    stop(): void {
        if (!this.running) return;
        this.running = false;
        if (this.useWorker) {
            this.rpc?.post({ type: 'flights/stop' });
            for (const unsub of this.pushUnsubs) unsub();
            this.pushUnsubs = [];
            this.previousBuffer = null;
        }
        this.stopFallback();
    }

    setViewport(vp: Viewport): void {
        this.viewport = vp;
        if (!this.running) return;
        if (this.useWorker) this.rpc?.post({ type: 'flights/viewport', viewport: vp });
        else this.fallbackScheduler?.refresh();
    }

    setPaused(paused: boolean): void {
        this.paused = paused;
        if (!this.running) return;
        if (this.useWorker) this.rpc?.post({ type: 'flights/pause', paused });
    }

    onStatus(fn: (status: ChannelStatus) => void): () => void {
        this.statusSubscribers.add(fn);
        fn(this.lastStatus);
        return () => this.statusSubscribers.delete(fn);
    }

    // ---- Worker-sti ----

    private startWorker(): boolean {
        const rpc = this.rpc;
        if (!rpc || !rpc.available) return false;

        this.pushUnsubs = [
            rpc.onPush<FlightsDeltaPush>('flights/delta', (msg) => {
                this.store.applyDelta({ upserts: msg.upserts, removes: msg.removes });
                this.store.setRoster(msg.roster);
                this.emitStatus({ ...this.lastStatus, count: this.store.size });
            }),
            rpc.onPush<FlightsPositionsPush>('flights/positions', (msg) => {
                // Idle-vern: ingenting flyttet og roster uendret → returner
                // bufferen direkte, uten apply (og uten requestRender nedstrøms).
                if (!msg.moved) {
                    rpc.post({ type: 'flights/bufferReturn', buffer: msg.buffer }, [msg.buffer]);
                    return;
                }
                // Returner FORRIGE buffer — den nye blir storens gjeldende og må
                // være gyldig for oppslag (tracking, gates) til neste tick.
                if (this.previousBuffer) {
                    rpc.post({ type: 'flights/bufferReturn', buffer: this.previousBuffer }, [
                        this.previousBuffer,
                    ]);
                }
                this.previousBuffer = msg.buffer;
                this.store.applyPositions(new Float64Array(msg.buffer));
            }),
            rpc.onPush<FlightsStatusPush>('flights/status', (msg) => {
                this.emitStatus({
                    loading: msg.loading,
                    error: msg.error,
                    lastUpdated: msg.lastUpdated,
                    count: this.store.size,
                });
            }),
        ];

        const posted = rpc.post({
            type: 'flights/start',
            pollMs: this.pollMs,
            viewport: this.viewport,
            mock: this.mock,
        });
        if (!posted) {
            for (const unsub of this.pushUnsubs) unsub();
            this.pushUnsubs = [];
            return false;
        }
        if (this.paused) rpc.post({ type: 'flights/pause', paused: true });
        return true;
    }

    // ---- Main-thread-fallback (samme FlightSessionCore som workeren) ----

    private startFallback(): void {
        const core = new FlightSessionCore();
        this.fallbackScheduler = new PollScheduler(
            async (signal) => {
                const flights = await this.fetchFn(this.viewport, signal);
                if (signal.aborted) return;
                const result = core.ingest(flights.map(toFlightEntity), Date.now());
                this.store.applyDelta({ upserts: result.upserts, removes: result.removes });
                this.store.setRoster(result.roster);
            },
            {
                intervalMs: this.pollMs,
                startupJitterMs: 0,
                isPaused: () => this.paused,
                onStatus: (s) => this.emitStatus({ ...s, count: this.store.size }),
            },
        );
        this.fallbackScheduler.start();
        this.fallbackDrTimer = setInterval(() => {
            if (this.paused || core.size === 0) return;
            const { buffer, moved } = core.buildPositions(Date.now(), this.fallbackBuffer);
            this.fallbackBuffer = buffer;
            if (moved) this.store.applyPositions(buffer);
        }, FLIGHT_DR_INTERVAL_MS);
    }

    private stopFallback(): void {
        this.fallbackScheduler?.stop();
        this.fallbackScheduler = null;
        if (this.fallbackDrTimer !== null) {
            clearInterval(this.fallbackDrTimer);
            this.fallbackDrTimer = null;
        }
        this.fallbackBuffer = null;
    }

    private emitStatus(status: ChannelStatus): void {
        this.lastStatus = status;
        for (const fn of this.statusSubscribers) fn(status);
    }
}
