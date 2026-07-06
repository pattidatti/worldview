import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PollScheduler, type PollStatus } from '../PollScheduler';

describe('PollScheduler', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('første fetch skjer innenfor jitter-vinduet, deretter fast intervall', async () => {
        const fn = vi.fn(async () => {});
        const s = new PollScheduler(fn, { intervalMs: 1000, startupJitterMs: 500 });
        s.start();

        await vi.advanceTimersByTimeAsync(500);
        expect(fn).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(fn).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1000);
        expect(fn).toHaveBeenCalledTimes(3);
        s.stop();
    });

    it('jitter 0 gir umiddelbar start', async () => {
        const fn = vi.fn(async () => {});
        const s = new PollScheduler(fn, { intervalMs: 1000, startupJitterMs: 0 });
        s.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(fn).toHaveBeenCalledTimes(1);
        s.stop();
    });

    it('overlap-guard: treg fetch + intervall-tick gir ingen dobbeltkjøring', async () => {
        let resolveFetch: () => void = () => {};
        const fn = vi.fn(
            () => new Promise<void>((resolve) => { resolveFetch = resolve; }),
        );
        const s = new PollScheduler(fn, { intervalMs: 100, startupJitterMs: 0 });
        s.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(fn).toHaveBeenCalledTimes(1);

        // Tre intervall-ticks mens første fetch fortsatt henger
        await vi.advanceTimersByTimeAsync(350);
        expect(fn).toHaveBeenCalledTimes(1);

        resolveFetch();
        await vi.advanceTimersByTimeAsync(100);
        expect(fn).toHaveBeenCalledTimes(2);
        s.stop();
    });

    it('stop() aborterer in-flight signal og stopper intervallet', async () => {
        let seenSignal: AbortSignal | null = null;
        const fn = vi.fn((signal: AbortSignal) => {
            seenSignal = signal;
            return new Promise<void>(() => {});
        });
        const s = new PollScheduler(fn, { intervalMs: 100, startupJitterMs: 0 });
        s.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(seenSignal).not.toBeNull();

        s.stop();
        expect(seenSignal!.aborted).toBe(true);
        await vi.advanceTimersByTimeAsync(1000);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('isPaused hopper over tick, gjenopptar når pause slipper', async () => {
        let paused = true;
        const fn = vi.fn(async () => {});
        const s = new PollScheduler(fn, { intervalMs: 100, startupJitterMs: 0, isPaused: () => paused });
        s.start();
        await vi.advanceTimersByTimeAsync(250);
        expect(fn).not.toHaveBeenCalled();

        paused = false;
        await vi.advanceTimersByTimeAsync(100);
        expect(fn).toHaveBeenCalledTimes(1);
        s.stop();
    });

    it('rapporterer status: loading → suksess med lastUpdated', async () => {
        const statuses: PollStatus[] = [];
        const s = new PollScheduler(async () => {}, {
            intervalMs: 1000,
            startupJitterMs: 0,
            onStatus: (st) => statuses.push(st),
        });
        s.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(statuses[0]).toMatchObject({ loading: true, error: null });
        expect(statuses[1].loading).toBe(false);
        expect(statuses[1].lastUpdated).not.toBeNull();
        s.stop();
    });

    it('rapporterer feilmelding ved kastet exception', async () => {
        const statuses: PollStatus[] = [];
        const s = new PollScheduler(
            async () => { throw new Error('HTTP 500'); },
            { intervalMs: 1000, startupJitterMs: 0, onStatus: (st) => statuses.push(st) },
        );
        s.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(statuses.at(-1)).toMatchObject({ loading: false, error: 'HTTP 500' });
        s.stop();
    });

    it('refresh() utenom intervallet respekterer overlap-guard', async () => {
        let resolveFetch: () => void = () => {};
        const fn = vi.fn(
            () => new Promise<void>((resolve) => { resolveFetch = resolve; }),
        );
        const s = new PollScheduler(fn, { intervalMs: 10_000, startupJitterMs: 0 });
        s.start();
        await vi.advanceTimersByTimeAsync(0);
        s.refresh();
        expect(fn).toHaveBeenCalledTimes(1);
        resolveFetch();
        await vi.advanceTimersByTimeAsync(0);
        s.refresh();
        expect(fn).toHaveBeenCalledTimes(2);
        s.stop();
    });

    it('start() er idempotent mens den kjører', async () => {
        const fn = vi.fn(async () => {});
        const s = new PollScheduler(fn, { intervalMs: 1000, startupJitterMs: 0 });
        s.start();
        s.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(fn).toHaveBeenCalledTimes(1);
        s.stop();
    });
});
