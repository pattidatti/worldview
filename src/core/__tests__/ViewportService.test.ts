import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ViewportService, viewportsEqual, type Viewport } from '../ViewportService';
import { Rectangle } from 'cesium';
import type { Viewer } from 'cesium';

function mockViewer(initial: Viewport) {
    let rect = Rectangle.fromDegrees(initial.west, initial.south, initial.east, initial.north);
    const listeners = new Set<() => void>();
    const viewer = {
        isDestroyed: () => false,
        camera: {
            computeViewRectangle: () => rect,
            changed: {
                addEventListener: (fn: () => void) => {
                    listeners.add(fn);
                    return () => listeners.delete(fn);
                },
            },
        },
    } as unknown as Viewer;
    return {
        viewer,
        listeners,
        moveCamera(vp: Viewport) {
            rect = Rectangle.fromDegrees(vp.west, vp.south, vp.east, vp.north);
            for (const fn of listeners) fn();
        },
    };
}

const OSLO: Viewport = { west: 10, south: 59, east: 11, north: 60 };
const GLOBAL: Viewport = { west: -170, south: -80, east: 170, north: 80 };

describe('viewportsEqual', () => {
    it('null forrige verdi er alltid ulik', () => {
        expect(viewportsEqual(null, OSLO)).toBe(false);
    });

    it('by-zoom: liten flytting under terskel (10% av 1° spenn) er lik', () => {
        const moved = { ...OSLO, west: 10.05, east: 11.05 };
        expect(viewportsEqual(OSLO, moved)).toBe(true);
    });

    it('by-zoom: flytting over terskel er ulik', () => {
        const moved = { ...OSLO, west: 10.2, east: 11.2 };
        expect(viewportsEqual(OSLO, moved)).toBe(false);
    });

    it('global zoom: flere graders drag er fortsatt lik (zoom-relativ terskel)', () => {
        const moved = { ...GLOBAL, west: -165, east: 175 };
        expect(viewportsEqual(GLOBAL, moved)).toBe(true);
    });
});

describe('ViewportService', () => {
    let service: ViewportService;

    beforeEach(() => {
        vi.useFakeTimers();
        service = new ViewportService();
    });

    afterEach(() => {
        service.detach();
        vi.useRealTimers();
    });

    it('leverer initial viewport umiddelbart ved subscribe etter attach', () => {
        const { viewer } = mockViewer(OSLO);
        service.attach(viewer);
        const fn = vi.fn();
        service.subscribe(fn);
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn.mock.calls[0][0].west).toBeCloseTo(10);
    });

    it('leverer initial viewport til lazy-abonnenter ved attach', () => {
        const fn = vi.fn();
        service.subscribe(fn);
        expect(fn).not.toHaveBeenCalled();
        const { viewer } = mockViewer(OSLO);
        service.attach(viewer);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('debouncer kamerabevegelse per subscriber', () => {
        const { viewer, moveCamera } = mockViewer(OSLO);
        service.attach(viewer);
        const fast = vi.fn();
        const slow = vi.fn();
        service.subscribe(fast, 100);
        service.subscribe(slow, 2000);
        fast.mockClear();
        slow.mockClear();

        moveCamera({ west: 20, south: 50, east: 25, north: 55 });
        vi.advanceTimersByTime(150);
        expect(fast).toHaveBeenCalledTimes(1);
        expect(slow).not.toHaveBeenCalled();
        vi.advanceTimersByTime(2000);
        expect(slow).toHaveBeenCalledTimes(1);
    });

    it('restarter debounce ved ny bevegelse før timeren fyrer', () => {
        const { viewer, moveCamera } = mockViewer(OSLO);
        service.attach(viewer);
        const fn = vi.fn();
        service.subscribe(fn, 1000);
        fn.mockClear();

        moveCamera({ west: 20, south: 50, east: 25, north: 55 });
        vi.advanceTimersByTime(600);
        moveCamera({ west: 30, south: 40, east: 35, north: 45 });
        vi.advanceTimersByTime(600);
        expect(fn).not.toHaveBeenCalled();
        vi.advanceTimersByTime(400);
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn.mock.calls[0][0].west).toBeCloseTo(30);
    });

    it('ingen callback ved bevegelse under terskel', () => {
        const { viewer, moveCamera } = mockViewer(OSLO);
        service.attach(viewer);
        const fn = vi.fn();
        service.subscribe(fn, 100);
        fn.mockClear();

        moveCamera({ ...OSLO, west: 10.02, east: 11.02 });
        vi.advanceTimersByTime(200);
        expect(fn).not.toHaveBeenCalled();
    });

    it('unsubscribe stopper leveranser og rydder timer', () => {
        const { viewer, moveCamera } = mockViewer(OSLO);
        service.attach(viewer);
        const fn = vi.fn();
        const unsub = service.subscribe(fn, 100);
        fn.mockClear();

        moveCamera({ west: 20, south: 50, east: 25, north: 55 });
        unsub();
        vi.advanceTimersByTime(200);
        expect(fn).not.toHaveBeenCalled();
    });

    it('getCurrent reflekterer kameraet direkte', () => {
        const { viewer, moveCamera } = mockViewer(OSLO);
        service.attach(viewer);
        moveCamera(GLOBAL);
        expect(service.getCurrent()?.north).toBeCloseTo(80);
    });
});
