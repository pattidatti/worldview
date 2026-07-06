import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShipChannel } from '../channels/shipChannel';
import type { Ship } from '@/types/ship';
import type { Viewport } from '@/core/ViewportService';
import { SHIP_DARK_MS } from '@/utils/ship-utils';

function ship(mmsi: number, overrides: Partial<Ship> = {}): Ship {
    return {
        mmsi, name: `S${mmsi}`, callSign: '', imo: 0,
        lat: 60, lon: 10, speed: 5, course: 90, heading: 90, rateOfTurn: 0,
        navStatus: 0, shipType: 70, length: 200, width: 28, draught: 8,
        destination: '', lastSeen: Date.now(),
        ...overrides,
    };
}

const VP: Viewport = { west: 0, south: 55, east: 20, north: 65 };

/** Fake AIS-tilkobling: fanger onUpdate og lar testen spille inn batcher. */
function fakeConnFactory() {
    let onUpdate: ((ships: Map<number, Ship>) => void) | null = null;
    const calls = { connect: 0, disconnect: 0, viewport: 0 };
    const factory = (
        _key: string, _vp: Viewport,
        cb: (ships: Map<number, Ship>) => void,
    ) => {
        onUpdate = cb;
        return {
            connect: () => { calls.connect++; },
            disconnect: () => { calls.disconnect++; },
            updateViewport: () => { calls.viewport++; },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
    };
    return { factory, calls, emit: (ships: Map<number, Ship>) => onUpdate?.(ships) };
}

describe('ShipChannel', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-07-06T00:00:00Z')); });
    afterEach(() => { vi.useRealTimers(); });

    it('kobler til først når viewport er satt', () => {
        const fake = fakeConnFactory();
        const ch = new ShipChannel({ apiKey: 'k', connectionFactory: fake.factory });
        ch.start();
        expect(fake.calls.connect).toBe(0); // ingen viewport ennå
        ch.setViewport(VP);
        expect(fake.calls.connect).toBe(1);
    });

    it('skriver AIS-batch som store-delta', () => {
        const fake = fakeConnFactory();
        const ch = new ShipChannel({ apiKey: 'k', connectionFactory: fake.factory });
        ch.setViewport(VP);
        ch.start();
        fake.emit(new Map([[257000001, ship(257000001)]]));
        expect(ch.store.size).toBe(1);
        expect(ch.store.get('257000001')?.mmsi).toBe(257000001);
    });

    it('markerer skip som mørkt når lastSeen er eldre enn SHIP_DARK_MS', () => {
        const fake = fakeConnFactory();
        const ch = new ShipChannel({ apiKey: 'k', connectionFactory: fake.factory });
        ch.setViewport(VP);
        ch.start();
        const old = Date.now() - SHIP_DARK_MS - 1000;
        fake.emit(new Map([[257000002, ship(257000002, { lastSeen: old })]]));
        expect(ch.store.get('257000002')?.dark).toBe(true);
    });

    it('flytter et mørkt skip til ghosts når det blir stale-fjernet', () => {
        const fake = fakeConnFactory();
        const ch = new ShipChannel({ apiKey: 'k', connectionFactory: fake.factory });
        ch.setViewport(VP);
        ch.start();
        // Første batch: et mørkt skip
        const darkTs = Date.now() - SHIP_DARK_MS - 1000;
        fake.emit(new Map([[257000003, ship(257000003, { lastSeen: darkTs })]]));
        expect(ch.store.size).toBe(1);
        // 61 min senere, ny batch UTEN skipet → stale-fjernes → ghost
        vi.setSystemTime(new Date(Date.now() + 61 * 60 * 1000));
        fake.emit(new Map());
        expect(ch.store.size).toBe(0);
        expect(ch.getGhosts().has(257000003)).toBe(true);
    });

    it('stop() rydder intern state og kobler fra', () => {
        const fake = fakeConnFactory();
        const ch = new ShipChannel({ apiKey: 'k', connectionFactory: fake.factory });
        ch.setViewport(VP);
        ch.start();
        fake.emit(new Map([[257000004, ship(257000004)]]));
        ch.stop();
        expect(fake.calls.disconnect).toBe(1);
        expect(ch.getGhosts().size).toBe(0);
    });
});
