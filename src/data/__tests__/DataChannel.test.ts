import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PollChannel, diffItems, type ChannelStatus } from '../DataChannel';
import { EntityStore } from '@/core/EntityStore';
import type { Viewport } from '@/core/ViewportService';

interface Item {
    id: string;
    value: number;
}

describe('diffItems', () => {
    it('upserter kun nye og endrede objekter, fjerner utgåtte', () => {
        const store = new EntityStore<Item>('test');
        store.applyDelta({
            upserts: [
                { id: 'a', value: 1 },
                { id: 'b', value: 2 },
                { id: 'c', value: 3 },
            ],
            removes: [],
        });

        const delta = diffItems(store, [
            { id: 'a', value: 1 },   // uendret → ingen upsert
            { id: 'b', value: 99 },  // endret
            { id: 'd', value: 4 },   // ny
        ]);

        expect(delta.upserts.map((u) => u.id).sort()).toEqual(['b', 'd']);
        expect(delta.removes).toEqual(['c']);
    });

    it('identisk datasett gir tom delta', () => {
        const store = new EntityStore<Item>('test');
        const items = [{ id: 'a', value: 1 }];
        store.applyDelta({ upserts: items, removes: [] });
        const delta = diffItems(store, [{ id: 'a', value: 1 }]);
        expect(delta.upserts).toHaveLength(0);
        expect(delta.removes).toHaveLength(0);
    });
});

class TestChannel extends PollChannel<Item> {
    fetchMock = vi.fn<(vp: Viewport | null, signal: AbortSignal) => Promise<Item[]>>(
        async () => [],
    );

    constructor() {
        super('test-channel', { intervalMs: 1000, startupJitterMs: 0 });
    }

    protected fetchItems(viewport: Viewport | null, signal: AbortSignal): Promise<Item[]> {
        return this.fetchMock(viewport, signal);
    }
}

describe('PollChannel', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('poll → delta inn i store, status med count', async () => {
        const channel = new TestChannel();
        channel.fetchMock.mockResolvedValue([
            { id: 'a', value: 1 },
            { id: 'b', value: 2 },
        ]);
        const statuses: ChannelStatus[] = [];
        channel.onStatus((s) => statuses.push(s));

        channel.start();
        await vi.advanceTimersByTimeAsync(0);

        expect(channel.store.size).toBe(2);
        expect(statuses.at(-1)).toMatchObject({ loading: false, error: null, count: 2 });
        channel.stop();
    });

    it('setViewport trigger refetch når kanalen kjører', async () => {
        const channel = new TestChannel();
        channel.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(channel.fetchMock).toHaveBeenCalledTimes(1);

        channel.setViewport({ west: 0, south: 0, east: 10, north: 10 });
        await vi.advanceTimersByTimeAsync(0);
        expect(channel.fetchMock).toHaveBeenCalledTimes(2);
        expect(channel.fetchMock.mock.calls[1][0]).toMatchObject({ east: 10 });
        channel.stop();
    });

    it('setPaused stopper polls uten å stoppe scheduleren', async () => {
        const channel = new TestChannel();
        channel.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(channel.fetchMock).toHaveBeenCalledTimes(1);

        channel.setPaused(true);
        await vi.advanceTimersByTimeAsync(3000);
        expect(channel.fetchMock).toHaveBeenCalledTimes(1);

        channel.setPaused(false);
        await vi.advanceTimersByTimeAsync(1000);
        expect(channel.fetchMock).toHaveBeenCalledTimes(2);
        channel.stop();
    });

    it('fetch-feil rapporteres i status, data beholdes', async () => {
        const channel = new TestChannel();
        channel.fetchMock.mockResolvedValueOnce([{ id: 'a', value: 1 }]);
        channel.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(channel.store.size).toBe(1);

        channel.fetchMock.mockRejectedValueOnce(new Error('HTTP 503'));
        const statuses: ChannelStatus[] = [];
        channel.onStatus((s) => statuses.push(s));
        await vi.advanceTimersByTimeAsync(1000);

        expect(statuses.at(-1)).toMatchObject({ error: 'HTTP 503' });
        expect(channel.store.size).toBe(1);
        channel.stop();
    });
});
