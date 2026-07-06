// Ships-datakanal (Fase C): eier AISStreamConnection (WebSocket, 5s-batch,
// reconnect, viewport-resubscribe) og skriver deltaer inn i EntityStore('ships').
// Ingen dead-reckoning (ships har ingen), ingen worker — WS er allerede utenfor
// React. Rendereren abonnerer på storen. All flåte-intelligens (prune, MAX_SHIPS,
// ghost-bokføring) som før lå i ShipLayers onUpdate lever nå her.

import { EntityStore, entityStores } from '@/core/EntityStore';
import type { Viewport } from '@/core/ViewportService';
import type { ChannelStatus, DataChannel } from '@/data/DataChannel';
import { diffItems } from '@/data/DataChannel';
import { AISStreamConnection } from '@/services/aisstream';
import { SHIP_DARK_MS, SHIP_GHOST_FADE_MS } from '@/utils/ship-utils';
import type { Ship } from '@/types/ship';
import {
    MAX_SHIPS,
    SHIP_STALE_MS,
    toShipEntity,
    type ShipEntity,
} from './shipProtocol';

export interface Ghost {
    ship: Ship;
    disappearedAt: number;
}

export interface ShipChannelOptions {
    apiKey: string;
    /** Test-hook: injiser en fabrikk for AIS-tilkoblingen. */
    connectionFactory?: (
        apiKey: string,
        viewport: Viewport,
        onUpdate: (ships: Map<number, Ship>) => void,
        onError?: (msg: string) => void,
    ) => AISStreamConnection;
}

export class ShipChannel implements DataChannel<ShipEntity> {
    readonly id = 'ships';
    readonly store: EntityStore<ShipEntity>;

    private readonly apiKey: string;
    private readonly makeConn: NonNullable<ShipChannelOptions['connectionFactory']>;

    private conn: AISStreamConnection | null = null;
    private running = false;
    private viewport: Viewport | null = null;

    private ships = new Map<number, Ship>();
    private timestamps = new Map<number, number>();
    private ghosts = new Map<number, Ghost>();

    private statusSubscribers = new Set<(status: ChannelStatus) => void>();
    private lastStatus: ChannelStatus = { loading: false, error: null, lastUpdated: null, count: 0 };

    constructor(opts: ShipChannelOptions) {
        this.apiKey = opts.apiKey;
        this.makeConn = opts.connectionFactory
            ?? ((key, vp, onUpdate, onError) => new AISStreamConnection(key, vp, onUpdate, onError));
        this.store = new EntityStore<ShipEntity>(this.id);
        entityStores.register(this.store);
    }

    /** Gjeldende ghosts (mørke skip som har forlatt AIS-strømmen). */
    getGhosts(): ReadonlyMap<number, Ghost> {
        return this.ghosts;
    }

    start(): void {
        if (this.running) return;
        this.running = true;
        this.emitStatus({ ...this.lastStatus, loading: true });
        this.tryConnect();
    }

    stop(): void {
        if (!this.running) return;
        this.running = false;
        this.conn?.disconnect();
        this.conn = null;
        // Fersk restart neste gang (som flights' worker-sesjon): tøm intern state.
        this.ships.clear();
        this.timestamps.clear();
        this.ghosts.clear();
    }

    setViewport(vp: Viewport): void {
        this.viewport = vp;
        if (!this.running) return;
        if (this.conn) this.conn.updateViewport(vp);
        else this.tryConnect();
    }

    /** Ships holder strømmen åpen under cinematic (som legacy) — no-op. */
    setPaused(_paused: boolean): void {
        void _paused;
    }

    onStatus(fn: (status: ChannelStatus) => void): () => void {
        this.statusSubscribers.add(fn);
        fn(this.lastStatus);
        return () => this.statusSubscribers.delete(fn);
    }

    private tryConnect(): void {
        if (this.conn || !this.viewport || !this.apiKey) return;
        this.conn = this.makeConn(
            this.apiKey,
            this.viewport,
            (ships) => this.ingest(ships),
            (msg) => this.emitStatus({ ...this.lastStatus, error: msg }),
        );
        this.conn.connect();
    }

    /**
     * Ta imot en AIS-batch: merge, prune stale (→ ghost hvis mørkt), cap på
     * MAX_SHIPS (nyest sett vinner), utløp gamle ghosts, diff mot store.
     */
    private ingest(updated: Map<number, Ship>): void {
        const now = Date.now();
        for (const [mmsi] of updated) this.timestamps.set(mmsi, now);
        for (const [mmsi, ship] of updated) this.ships.set(mmsi, ship);

        const staleThreshold = now - SHIP_STALE_MS;
        for (const [mmsi, ship] of this.ships) {
            if ((this.timestamps.get(mmsi) ?? 0) < staleThreshold) {
                const wasDark = ship.lastSeen > 0 && (now - ship.lastSeen) > SHIP_DARK_MS;
                if (wasDark && !this.ghosts.has(mmsi)) this.ghosts.set(mmsi, { ship, disappearedAt: now });
                this.ships.delete(mmsi);
                this.timestamps.delete(mmsi);
            }
        }

        if (this.ships.size > MAX_SHIPS) {
            const sorted = [...this.ships.entries()].sort(
                (a, b) => (this.timestamps.get(b[0]) ?? 0) - (this.timestamps.get(a[0]) ?? 0),
            );
            this.ships = new Map(sorted.slice(0, MAX_SHIPS));
        }

        for (const [mmsi, ghost] of this.ghosts) {
            if (now - ghost.disappearedAt > SHIP_GHOST_FADE_MS) this.ghosts.delete(mmsi);
        }

        const list = [...this.ships.values()].map((s) => toShipEntity(s, now));
        this.store.applyDelta(diffItems(this.store, list));
        this.emitStatus({ loading: false, error: null, lastUpdated: now, count: this.store.size });
    }

    private emitStatus(status: ChannelStatus): void {
        this.lastStatus = status;
        for (const fn of this.statusSubscribers) fn(status);
    }
}
