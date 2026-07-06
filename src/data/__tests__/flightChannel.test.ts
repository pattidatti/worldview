import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FlightChannel, type ChannelRpc } from '../channels/flightChannel';
import {
    FLIGHT_BUFFER_LAYOUT,
    type FlightEntity,
    type FlightsDeltaPush,
    type FlightsPositionsPush,
} from '../channels/flightProtocol';
import type { Flight } from '@/types/flight';

function flight(icao24: string, overrides: Partial<Flight> = {}): Flight {
    return {
        icao24,
        callsign: `SK${icao24}`,
        originCountry: '',
        lon: 10,
        lat: 60,
        altitude: 10_000,
        velocity: 250,
        heading: 90,
        verticalRate: 0,
        onGround: false,
        positionSource: 0,
        isMilitary: false,
        ...overrides,
    };
}

/** Fake rpc som lar testen spille inn push-meldinger og inspisere posts. */
function fakeRpc(available = true) {
    const handlers = new Map<string, Set<(msg: unknown) => void>>();
    const posts: { msg: Record<string, unknown>; transfer?: Transferable[] }[] = [];
    const rpc: ChannelRpc = {
        available,
        post(msg: object, transfer?: Transferable[]) {
            if (!available) return false;
            posts.push({ msg: msg as Record<string, unknown>, transfer });
            return true;
        },
        onPush<TMsg>(type: string, fn: (msg: TMsg) => void) {
            let set = handlers.get(type);
            if (!set) {
                set = new Set();
                handlers.set(type, set);
            }
            set.add(fn as (msg: unknown) => void);
            return () => set.delete(fn as (msg: unknown) => void);
        },
    };
    return {
        rpc,
        posts,
        push(type: string, msg: unknown) {
            for (const fn of handlers.get(type) ?? []) fn(msg);
        },
    };
}

describe('FlightChannel (worker-sti)', () => {
    it('start poster flights/start med pollMs og viewport', () => {
        const { rpc, posts } = fakeRpc();
        const channel = new FlightChannel({ rpc, pollMs: 5000 });
        channel.setViewport({ west: 0, south: 50, east: 20, north: 70 });
        channel.start();

        const startMsg = posts.find((p) => p.msg.type === 'flights/start');
        expect(startMsg).toBeDefined();
        expect(startMsg!.msg.pollMs).toBe(5000);
        expect((startMsg!.msg.viewport as { north: number }).north).toBe(70);
        channel.stop();
    });

    it('delta-push → store (applyDelta + roster) og status-count', () => {
        const { rpc, push } = fakeRpc();
        const channel = new FlightChannel({ rpc });
        channel.start();

        const statuses: number[] = [];
        channel.onStatus((s) => statuses.push(s.count));

        push('flights/delta', {
            type: 'flights/delta',
            upserts: [{ ...flight('abc'), id: 'abc' }] as FlightEntity[],
            removes: [],
            roster: ['abc'],
        } satisfies FlightsDeltaPush);

        expect(channel.store.size).toBe(1);
        expect(channel.store.get('abc')?.callsign).toBe('SKabc');
        expect(channel.store.getSlot('abc')).toBe(0);
        expect(statuses.at(-1)).toBe(1);
        channel.stop();
    });

    it('positions-push → applyPositions; forrige buffer returneres (dobbel-buffring)', () => {
        const { rpc, posts, push } = fakeRpc();
        const channel = new FlightChannel({ rpc });
        channel.start();

        push('flights/delta', {
            type: 'flights/delta',
            upserts: [{ ...flight('abc'), id: 'abc' }] as FlightEntity[],
            removes: [],
            roster: ['abc'],
        } satisfies FlightsDeltaPush);

        const bufA = new Float64Array(FLIGHT_BUFFER_LAYOUT.stride).buffer;
        push('flights/positions', {
            type: 'flights/positions', buffer: bufA, count: 1, moved: true,
        } satisfies FlightsPositionsPush);

        // Første buffer: ingenting å returnere ennå
        expect(posts.some((p) => p.msg.type === 'flights/bufferReturn')).toBe(false);
        expect(channel.store.getPositionBuffer()?.buffer.buffer).toBe(bufA);

        const bufB = new Float64Array(FLIGHT_BUFFER_LAYOUT.stride).buffer;
        push('flights/positions', {
            type: 'flights/positions', buffer: bufB, count: 1, moved: true,
        } satisfies FlightsPositionsPush);

        // Nå returneres bufA med transfer, og bufB er gjeldende
        const ret = posts.find((p) => p.msg.type === 'flights/bufferReturn');
        expect(ret).toBeDefined();
        expect(ret!.msg.buffer).toBe(bufA);
        expect(ret!.transfer).toContain(bufA);
        expect(channel.store.getPositionBuffer()?.buffer.buffer).toBe(bufB);
        channel.stop();
    });

    it('stop poster flights/stop og kobler av push-handlere', () => {
        const { rpc, posts, push } = fakeRpc();
        const channel = new FlightChannel({ rpc });
        channel.start();
        channel.stop();

        expect(posts.some((p) => p.msg.type === 'flights/stop')).toBe(true);
        push('flights/delta', {
            type: 'flights/delta',
            upserts: [{ ...flight('x'), id: 'x' }] as FlightEntity[],
            removes: [],
            roster: ['x'],
        } satisfies FlightsDeltaPush);
        expect(channel.store.size).toBe(0);
    });

    it('setViewport/setPaused videresendes til workeren', () => {
        const { rpc, posts } = fakeRpc();
        const channel = new FlightChannel({ rpc });
        channel.start();
        channel.setViewport({ west: 0, south: 0, east: 1, north: 1 });
        channel.setPaused(true);
        expect(posts.some((p) => p.msg.type === 'flights/viewport')).toBe(true);
        expect(posts.some((p) => p.msg.type === 'flights/pause' && p.msg.paused === true)).toBe(true);
        channel.stop();
    });
});

describe('FlightChannel (main-thread-fallback)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('uten rpc: poll → store-delta, DR-tick → posisjonsbuffer', async () => {
        const fetchFn = vi.fn(async () => [flight('abc', { heading: 90, velocity: 250 })]);
        const channel = new FlightChannel({ rpc: null, pollMs: 10_000, fetchFn });
        channel.start();

        await vi.advanceTimersByTimeAsync(0);
        expect(fetchFn).toHaveBeenCalled();
        expect(channel.store.size).toBe(1);
        expect(channel.store.getSlot('abc')).toBe(0);

        const posSub = vi.fn();
        channel.store.subscribePositions(posSub);
        await vi.advanceTimersByTimeAsync(300);
        expect(posSub).toHaveBeenCalled();

        const pb = channel.store.getPositionBuffer();
        expect(pb).not.toBeNull();
        expect(pb!.buffer[1]).toBeCloseTo(60, 4); // lat ~uendret ved heading 90
        channel.stop();
    });

    it('utilgjengelig rpc faller tilbake til main thread', async () => {
        const { rpc } = fakeRpc(false);
        const fetchFn = vi.fn(async () => [flight('abc')]);
        const channel = new FlightChannel({ rpc, pollMs: 10_000, fetchFn });
        channel.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchFn).toHaveBeenCalled();
        expect(channel.store.size).toBe(1);
        channel.stop();
    });

    it('setPaused stopper fallback-DR og polls', async () => {
        const fetchFn = vi.fn(async () => [flight('abc')]);
        const channel = new FlightChannel({ rpc: null, pollMs: 1000, fetchFn });
        channel.start();
        await vi.advanceTimersByTimeAsync(0);

        channel.setPaused(true);
        const posSub = vi.fn();
        channel.store.subscribePositions(posSub);
        await vi.advanceTimersByTimeAsync(2000);
        expect(posSub).not.toHaveBeenCalled();
        expect(fetchFn).toHaveBeenCalledTimes(1);
        channel.stop();
    });
});
