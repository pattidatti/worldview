export interface PollStatus {
    loading: boolean;
    error: string | null;
    lastUpdated: number | null;
}

export interface PollSchedulerOptions {
    intervalMs: number;
    /**
     * Sprer startup-tidspunktet med opptil denne mengden ms (jittered).
     * Unngår at alle kanaler fyrer nettverkskall i samme tick ved oppstart.
     */
    startupJitterMs?: number;
    /** Hopp over tick når true — cinematic-tour, skjult fane, replay-modus. */
    isPaused?: () => boolean;
    onStatus?: (status: PollStatus) => void;
}

/**
 * Poll-syklus som klasse — logikken fra usePollingData (jitter, in-flight-
 * overlap-guard, abort ved stopp) uten React, så den kan brukes av
 * DataChannel-klasser på main thread OG i web workers (DOM-fri).
 */
export class PollScheduler {
    private readonly fn: (signal: AbortSignal) => Promise<void>;
    private readonly intervalMs: number;
    private readonly startupJitterMs: number;
    private readonly isPaused: () => boolean;
    private readonly onStatus?: (status: PollStatus) => void;

    private startTimeout: ReturnType<typeof setTimeout> | null = null;
    private intervalId: ReturnType<typeof setInterval> | null = null;
    // In-flight-vern: uten dette starter intervallet en ny fetch oppå en treg
    // pågående en, og requests stables ved nettverkstrøbbel.
    private inFlight = false;
    private abortController: AbortController | null = null;
    private stopped = true;
    private lastUpdated: number | null = null;

    constructor(fn: (signal: AbortSignal) => Promise<void>, opts: PollSchedulerOptions) {
        this.fn = fn;
        this.intervalMs = opts.intervalMs;
        this.startupJitterMs = opts.startupJitterMs ?? 1500;
        this.isPaused = opts.isPaused ?? (() => false);
        this.onStatus = opts.onStatus;
    }

    get running(): boolean {
        return !this.stopped;
    }

    start(): void {
        if (!this.stopped) return;
        this.stopped = false;
        const jitter = this.startupJitterMs > 0 ? Math.random() * this.startupJitterMs : 0;
        this.startTimeout = setTimeout(() => {
            this.startTimeout = null;
            void this.tick();
            this.intervalId = setInterval(() => void this.tick(), this.intervalMs);
        }, jitter);
    }

    /** Abort in-flight, rydd timere. Trygt å kalle flere ganger. */
    stop(): void {
        this.stopped = true;
        if (this.startTimeout !== null) {
            clearTimeout(this.startTimeout);
            this.startTimeout = null;
        }
        if (this.intervalId !== null) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.abortController?.abort();
        this.inFlight = false;
    }

    /** Manuell fetch utenom intervallet. Respekterer overlap-guard og pause. */
    refresh(): void {
        void this.tick();
    }

    private async tick(): Promise<void> {
        if (this.isPaused()) return;
        if (this.inFlight) return;
        this.inFlight = true;
        const controller = new AbortController();
        this.abortController = controller;
        this.emitStatus({ loading: true, error: null });
        try {
            await this.fn(controller.signal);
            if (this.stopped || controller.signal.aborted) return;
            this.lastUpdated = Date.now();
            this.emitStatus({ loading: false, error: null });
        } catch (e) {
            if (this.stopped || controller.signal.aborted) return;
            this.emitStatus({
                loading: false,
                error: e instanceof Error ? e.message : 'Ukjent feil',
            });
        } finally {
            this.inFlight = false;
        }
    }

    private emitStatus(partial: { loading: boolean; error: string | null }): void {
        this.onStatus?.({ ...partial, lastUpdated: this.lastUpdated });
    }
}
