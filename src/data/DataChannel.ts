import { EntityStore, type EntityDelta, type PositionBufferLayout } from '@/core/EntityStore';
import type { Viewport } from '@/core/ViewportService';
import { PollScheduler } from '@/data/PollScheduler';

export interface ChannelStatus {
    loading: boolean;
    error: string | null;
    lastUpdated: number | null;
    count: number;
}

/**
 * Én datakilde → én kanal → én EntityStore (jf. docs/ARCHITECTURE-VISION.md).
 * Kanalen eier fetch/WS/poll-syklusen og produserer normaliserte deltaer inn
 * i storen. React-lag-shims kobler status til layerStore og synlighet til
 * start/stop; renderere abonnerer direkte på storen.
 */
export interface DataChannel<T extends { id: string }> {
    readonly id: string;
    readonly store: EntityStore<T>;
    start(): void;
    stop(): void;
    /** No-op for globale kilder. */
    setViewport(vp: Viewport): void;
    /** Cinematic-tour, replay-modus, skjult fane. */
    setPaused(paused: boolean): void;
    onStatus(fn: (status: ChannelStatus) => void): () => void;
}

/**
 * Diff en ny datamengde mot forrige tilstand: upsert kun nye/endrede objekter
 * (shallow-equal), remove alt som ikke lenger finnes. Holder delta-varslinger
 * små når kilden returnerer overveiende uendrede objekter. DOM-fri — brukes
 * også av channel-worker-sesjoner.
 */
export function diffMap<T extends { id: string }>(
    prev: ReadonlyMap<string, T>,
    items: T[],
): EntityDelta<T> {
    const upserts: T[] = [];
    const seen = new Set<string>();
    for (const item of items) {
        seen.add(item.id);
        const existing = prev.get(item.id);
        if (!existing || !shallowEqual(existing, item)) upserts.push(item);
    }
    const removes: string[] = [];
    for (const id of prev.keys()) {
        if (!seen.has(id)) removes.push(id);
    }
    return { upserts, removes };
}

/** Som diffMap, mot en EntityStores innhold. */
export function diffItems<T extends { id: string }>(
    store: EntityStore<T>,
    items: T[],
): EntityDelta<T> {
    return diffMap(store.getAll(), items);
}

function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
        if (a[key] !== b[key]) return false;
    }
    return true;
}

export interface PollChannelOptions {
    intervalMs: number;
    startupJitterMs?: number;
    positionLayout?: PositionBufferLayout;
    /** Refetch umiddelbart når viewport endres (default true for viewport-avhengige kilder). */
    refetchOnViewport?: boolean;
}

/**
 * Basisklasse for enkle poll-kilder: PollScheduler + fetch + delta-diff mot
 * store. Subklasser implementerer kun `fetchItems`.
 */
export abstract class PollChannel<T extends { id: string }> implements DataChannel<T> {
    readonly id: string;
    readonly store: EntityStore<T>;

    protected viewport: Viewport | null = null;
    private paused = false;
    private scheduler: PollScheduler;
    private statusSubscribers = new Set<(status: ChannelStatus) => void>();
    private lastStatus: ChannelStatus = { loading: false, error: null, lastUpdated: null, count: 0 };
    private readonly refetchOnViewport: boolean;

    constructor(id: string, opts: PollChannelOptions) {
        this.id = id;
        this.store = new EntityStore<T>(id, opts.positionLayout);
        this.refetchOnViewport = opts.refetchOnViewport ?? true;
        this.scheduler = new PollScheduler(
            async (signal) => {
                const items = await this.fetchItems(this.viewport, signal);
                if (signal.aborted) return;
                this.store.applyDelta(diffItems(this.store, items));
            },
            {
                intervalMs: opts.intervalMs,
                startupJitterMs: opts.startupJitterMs,
                isPaused: () => this.paused,
                onStatus: (s) => this.emitStatus({ ...s, count: this.store.size }),
            },
        );
    }

    protected abstract fetchItems(viewport: Viewport | null, signal: AbortSignal): Promise<T[]>;

    start(): void {
        this.scheduler.start();
    }

    stop(): void {
        this.scheduler.stop();
    }

    setViewport(vp: Viewport): void {
        this.viewport = vp;
        if (this.refetchOnViewport && this.scheduler.running) this.scheduler.refresh();
    }

    setPaused(paused: boolean): void {
        this.paused = paused;
    }

    onStatus(fn: (status: ChannelStatus) => void): () => void {
        this.statusSubscribers.add(fn);
        fn(this.lastStatus);
        return () => this.statusSubscribers.delete(fn);
    }

    private emitStatus(status: ChannelStatus): void {
        this.lastStatus = status;
        for (const fn of this.statusSubscribers) fn(status);
    }
}
