import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RenderScheduler } from '../RenderScheduler';
import type { Viewer } from 'cesium';

function mockViewer() {
    const requestRender = vi.fn();
    const viewer = {
        isDestroyed: () => false,
        scene: { requestRender },
    } as unknown as Viewer;
    return { viewer, requestRender };
}

describe('RenderScheduler', () => {
    let scheduler: RenderScheduler;

    beforeEach(() => {
        vi.useFakeTimers();
        scheduler = new RenderScheduler();
    });

    afterEach(() => {
        scheduler.detach();
        vi.useRealTimers();
    });

    describe('animate', () => {
        it('kjører flere jobber på samme viewer med maks én requestRender per tick', () => {
            const { viewer, requestRender } = mockViewer();
            scheduler.attach(viewer);
            const tickA = vi.fn();
            const tickB = vi.fn();
            scheduler.animate({ durationMs: 1000, onTick: tickA });
            scheduler.animate({ durationMs: 1000, onTick: tickB });

            vi.advanceTimersByTime(33);
            expect(tickA).toHaveBeenCalledTimes(1);
            expect(tickB).toHaveBeenCalledTimes(1);
            expect(requestRender).toHaveBeenCalledTimes(1);
        });

        it('kaller onDone ved t >= 1 og stopper timeren når alle jobber er ferdige', () => {
            const { viewer } = mockViewer();
            scheduler.attach(viewer);
            const onDone = vi.fn();
            scheduler.animate({ durationMs: 50, onTick: () => {}, onDone });

            vi.advanceTimersByTime(100);
            expect(onDone).toHaveBeenCalledTimes(1);

            // Timer stoppet: ingen flere ticks selv om tiden går
            const before = vi.getTimerCount();
            vi.advanceTimersByTime(500);
            expect(vi.getTimerCount()).toBe(before);
        });

        it('leverer t=1 som siste tick-verdi', () => {
            const { viewer } = mockViewer();
            scheduler.attach(viewer);
            const values: number[] = [];
            scheduler.animate({ durationMs: 66, onTick: (t) => values.push(t) });
            vi.advanceTimersByTime(200);
            expect(values[values.length - 1]).toBe(1);
        });

        it('dropper jobber der viewer er destroyed', () => {
            const requestRender = vi.fn();
            let destroyed = false;
            const viewer = {
                isDestroyed: () => destroyed,
                scene: { requestRender },
            } as unknown as Viewer;
            scheduler.attach(viewer);
            const onTick = vi.fn();
            scheduler.animate({ durationMs: 1000, onTick });

            vi.advanceTimersByTime(33);
            expect(onTick).toHaveBeenCalledTimes(1);
            destroyed = true;
            vi.advanceTimersByTime(33);
            expect(onTick).toHaveBeenCalledTimes(1);
        });

        it('bruker eksplisitt viewer-parameter foran attached viewer', () => {
            const attached = mockViewer();
            const explicit = mockViewer();
            scheduler.attach(attached.viewer);
            scheduler.animate({ durationMs: 100, onTick: () => {} }, explicit.viewer);
            vi.advanceTimersByTime(33);
            expect(explicit.requestRender).toHaveBeenCalledTimes(1);
            expect(attached.requestRender).not.toHaveBeenCalled();
        });
    });

    describe('acquireContinuous', () => {
        it('to holdere på 30hz deler én interval', () => {
            const { viewer, requestRender } = mockViewer();
            scheduler.attach(viewer);
            scheduler.acquireContinuous(30, 'a');
            scheduler.acquireContinuous(30, 'b');

            vi.advanceTimersByTime(1000 / 30);
            expect(requestRender).toHaveBeenCalledTimes(1);
        });

        it('60hz-holder overstyrer 30hz; release faller tilbake', () => {
            const { viewer, requestRender } = mockViewer();
            scheduler.attach(viewer);
            scheduler.acquireContinuous(30, 'slow');
            const release60 = scheduler.acquireContinuous(60, 'fast');

            vi.advanceTimersByTime(1000);
            const at60 = requestRender.mock.calls.length;
            expect(at60).toBeGreaterThanOrEqual(55);

            release60();
            requestRender.mockClear();
            vi.advanceTimersByTime(1000);
            expect(requestRender.mock.calls.length).toBeLessThanOrEqual(31);
            expect(requestRender.mock.calls.length).toBeGreaterThanOrEqual(28);
        });

        it('release av alle holdere stopper intervallet', () => {
            const { viewer, requestRender } = mockViewer();
            scheduler.attach(viewer);
            const r1 = scheduler.acquireContinuous(30, 'a');
            const r2 = scheduler.acquireContinuous(30, 'b');
            r1();
            r2();
            vi.advanceTimersByTime(1000);
            expect(requestRender).not.toHaveBeenCalled();
        });

        it('dobbel release er no-op', () => {
            const { viewer } = mockViewer();
            scheduler.attach(viewer);
            const r1 = scheduler.acquireContinuous(30, 'a');
            scheduler.acquireContinuous(30, 'b');
            r1();
            r1();
            expect(scheduler.getActiveTags()).toEqual(['b']);
        });
    });

    describe('requestFrame', () => {
        it('koalescerer N kall i samme mikrotask til én requestRender', async () => {
            const { viewer, requestRender } = mockViewer();
            scheduler.attach(viewer);
            scheduler.requestFrame();
            scheduler.requestFrame();
            scheduler.requestFrame();
            await Promise.resolve();
            expect(requestRender).toHaveBeenCalledTimes(1);
        });

        it('er no-op uten attached viewer', async () => {
            scheduler.requestFrame();
            await Promise.resolve();
            // Ingen krasj — det er testen
        });
    });
});
