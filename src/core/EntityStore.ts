export interface EntityDelta<T> {
    upserts: T[];
    removes: string[];
}

export interface PositionBufferLayout {
    /** Antall Float64-felter per objekt. */
    stride: number;
    /** Feltnavn i slot-rekkefølge, f.eks. ['lon','lat','alt','heading','velocity','flags']. */
    fields: readonly string[];
}

type DeltaSubscriber<T> = (delta: EntityDelta<T>, version: number) => void;
type PositionsSubscriber = (version: number) => void;

/**
 * Normalisert entity-tilstand per datakanal — utenfor React
 * (jf. docs/ARCHITECTURE-VISION.md, dataplanet). To oppdateringsstier:
 *
 *  - `applyDelta` — objekt-endringer (nye/fjernede/endrede entiteter).
 *    Varsler delta-subscribers (renderere gjør inkrementell upsert/remove,
 *    React-aggregater leser counts).
 *  - `setRoster` + `applyPositions` — posisjons-hurtigsti for tunge kanaler:
 *    workeren poster transferable Float64Array @ 4 Hz; kun positions-
 *    subscribers (rendereren) varsles, delta-subscribers forblir i ro.
 *
 * `version` er monotont økende — en renderer kan resynke fullt (getAll)
 * etter attach eller tapt delta.
 */
export class EntityStore<T extends { id: string }> {
    readonly channelId: string;
    readonly positionLayout: PositionBufferLayout | null;

    private entities = new Map<string, T>();
    private _version = 0;

    private rosterIds: readonly string[] = [];
    private slotById = new Map<string, number>();
    private positionBuffer: Float64Array | null = null;

    private deltaSubscribers = new Set<DeltaSubscriber<T>>();
    private positionsSubscribers = new Set<PositionsSubscriber>();

    constructor(channelId: string, positionLayout?: PositionBufferLayout) {
        this.channelId = channelId;
        this.positionLayout = positionLayout ?? null;
    }

    get version(): number {
        return this._version;
    }

    get size(): number {
        return this.entities.size;
    }

    get(id: string): T | undefined {
        return this.entities.get(id);
    }

    getAll(): ReadonlyMap<string, T> {
        return this.entities;
    }

    /** Normaliserte deltaer fra kanalen. Bumper version, varsler delta-subscribers. */
    applyDelta(delta: EntityDelta<T>): void {
        if (delta.upserts.length === 0 && delta.removes.length === 0) return;
        for (const item of delta.upserts) this.entities.set(item.id, item);
        for (const id of delta.removes) this.entities.delete(id);
        this._version++;
        for (const fn of this.deltaSubscribers) fn(delta, this._version);
    }

    /**
     * Sett posisjonsbuffer-rosteret: id per slot. Sendes kun når rosteret
     * endres (etter applyDelta), ikke per posisjons-tick.
     */
    setRoster(ids: readonly string[]): void {
        this.rosterIds = ids;
        this.slotById.clear();
        for (let i = 0; i < ids.length; i++) this.slotById.set(ids[i], i);
    }

    /**
     * Posisjons-tick fra worker (transferable Float64Array, layout per
     * konstruktør). Bumper version og varsler KUN positions-subscribers.
     */
    applyPositions(buffer: Float64Array): void {
        if (!this.positionLayout) {
            throw new Error(`EntityStore(${this.channelId}) har ingen positionLayout`);
        }
        this.positionBuffer = buffer;
        this._version++;
        for (const fn of this.positionsSubscribers) fn(this._version);
    }

    getPositionBuffer(): {
        buffer: Float64Array;
        ids: readonly string[];
        layout: PositionBufferLayout;
    } | null {
        if (!this.positionBuffer || !this.positionLayout) return null;
        return { buffer: this.positionBuffer, ids: this.rosterIds, layout: this.positionLayout };
    }

    /** Slot-indeks i posisjonsbufferen for en id, eller -1. */
    getSlot(id: string): number {
        return this.slotById.get(id) ?? -1;
    }

    subscribe(fn: DeltaSubscriber<T>): () => void {
        this.deltaSubscribers.add(fn);
        return () => this.deltaSubscribers.delete(fn);
    }

    subscribePositions(fn: PositionsSubscriber): () => void {
        this.positionsSubscribers.add(fn);
        return () => this.positionsSubscribers.delete(fn);
    }

    /**
     * Tøm alt — brukes ved replay-modusbytte (modeEpoch-bump) så live- og
     * replay-avledede posisjoner aldri blandes. Varsler delta-subscribers
     * med removes for alle id-er.
     */
    clear(): void {
        if (this.entities.size === 0 && this.rosterIds.length === 0) return;
        const removes = [...this.entities.keys()];
        this.entities.clear();
        this.rosterIds = [];
        this.slotById.clear();
        this.positionBuffer = null;
        this._version++;
        for (const fn of this.deltaSubscribers) fn({ upserts: [], removes }, this._version);
    }
}

/** Oppslag for popups/tracking: kanal-id → store. */
const registry = new Map<string, EntityStore<{ id: string }>>();

export const entityStores = {
    register(store: EntityStore<{ id: string }>): void {
        registry.set(store.channelId, store);
    },
    unregister(channelId: string): void {
        registry.delete(channelId);
    },
    get<T extends { id: string }>(channelId: string): EntityStore<T> | undefined {
        return registry.get(channelId) as EntityStore<T> | undefined;
    },
};
