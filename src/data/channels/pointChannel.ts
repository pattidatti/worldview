// Generisk punktlag-datakanal (jf. docs/ARCHITECTURE-VISION.md, Fase D):
// poll → map til normalisert PointEntity → delta inn i EntityStore. Rendereren
// (PointRenderer) abonnerer på storen. Erstatter usePollingData + syncEntities
// i ~ti tidligere komponenter — laget blir konfig, ikke kode.

import { EntityStore, entityStores, type EntityDelta } from '@/core/EntityStore';
import type { Viewport } from '@/core/ViewportService';
import type { ChannelStatus, DataChannel } from '@/data/DataChannel';
import { PollScheduler } from '@/data/PollScheduler';
import { toPointEntity, type PointEntity, type PointLayerConfig } from './pointProtocol';

/**
 * Diff mot storen på en billig signatur (id + posisjon + stil) i stedet for
 * full shallow-equal: `source`-referansen er ny hver poll, så en naiv diff ville
 * markert alt som endret. Holder delta-varslinger små for tunge lag (news,
 * conflicts) som poller mange objekter.
 */
function signature(e: PointEntity): string {
    return `${e.lat.toFixed(4)}:${e.lon.toFixed(4)}:${e.alt}:${e.iconId}:${e.color}:${e.sizePx}`;
}

function diffBySignature<T>(
    prev: ReadonlyMap<string, PointEntity<T>>,
    next: PointEntity<T>[],
): EntityDelta<PointEntity<T>> {
    const upserts: PointEntity<T>[] = [];
    const seen = new Set<string>();
    for (const item of next) {
        seen.add(item.id);
        const existing = prev.get(item.id);
        // Upsert hvis ny ELLER signatur endret. Uendrede objekter beholder sitt
        // gamle `source` ikke — vi upserter alltid nye source-refs når noe annet
        // endret seg, men lar helt uendrede punkter ligge (ingen render-churn).
        if (!existing || signature(existing) !== signature(item)) upserts.push(item);
    }
    const removes: string[] = [];
    for (const id of prev.keys()) {
        if (!seen.has(id)) removes.push(id);
    }
    return { upserts, removes };
}

export class PointChannel<T> implements DataChannel<PointEntity<T>> {
    readonly id: string;
    readonly store: EntityStore<PointEntity<T>>;
    readonly config: PointLayerConfig<T>;

    private viewport: Viewport | null = null;
    private paused = false;
    private scheduler: PollScheduler;
    private statusSubscribers = new Set<(status: ChannelStatus) => void>();
    private lastStatus: ChannelStatus = { loading: false, error: null, lastUpdated: null, count: 0 };

    constructor(config: PointLayerConfig<T>) {
        this.id = config.layerId;
        this.config = config;
        this.store = new EntityStore<PointEntity<T>>(this.id);
        entityStores.register(this.store);
        this.scheduler = new PollScheduler(
            async (signal) => {
                const raw = await config.fetch(this.viewport, signal);
                if (signal.aborted) return;
                const items = raw.map((item) => toPointEntity(config, item));
                this.store.applyDelta(diffBySignature(this.store.getAll(), items));
            },
            {
                intervalMs: config.pollMs,
                startupJitterMs: config.startupJitterMs,
                isPaused: () => this.paused,
                onStatus: (s) => this.emitStatus({ ...s, count: this.store.size }),
            },
        );
    }

    start(): void {
        this.scheduler.start();
    }

    stop(): void {
        this.scheduler.stop();
    }

    setViewport(vp: Viewport): void {
        this.viewport = vp;
        if ((this.config.viewportAware ?? false) && this.scheduler.running) this.scheduler.refresh();
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
