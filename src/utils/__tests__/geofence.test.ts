import { describe, expect, it } from 'vitest';
import {
    autoSplitSegments,
    bearing,
    crossesAntimeridian,
    crossingDirection,
    haversineKm,
    isNearPole,
    measureSegments,
    segmentsIntersect,
} from '../geofence';

describe('haversineKm', () => {
    it('returns 0 for identical points', () => {
        expect(haversineKm({ lat: 60, lon: 10 }, { lat: 60, lon: 10 })).toBe(0);
    });

    it('matches Oslo–Bergen distance (~308 km)', () => {
        const d = haversineKm(
            { lat: 59.9139, lon: 10.7522 },
            { lat: 60.3913, lon: 5.3221 },
        );
        expect(d).toBeGreaterThan(300);
        expect(d).toBeLessThan(320);
    });

    it('handles equator antipode (~20 015 km)', () => {
        const d = haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 180 });
        expect(d).toBeGreaterThan(20000);
        expect(d).toBeLessThan(20100);
    });
});

describe('bearing', () => {
    it('returns 0 for due north', () => {
        expect(bearing({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(0, 1);
    });

    it('returns ~90 for due east near equator', () => {
        expect(bearing({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(90, 1);
    });

    it('returns ~180 for due south', () => {
        expect(bearing({ lat: 1, lon: 0 }, { lat: 0, lon: 0 })).toBeCloseTo(180, 1);
    });
});

describe('segmentsIntersect', () => {
    it('finds perpendicular crossing near Oslo', () => {
        // Horizontal gate across latitude 60, small span. Vertical flight path.
        const gateA = { lat: 60.0, lon: 10.5 };
        const gateB = { lat: 60.0, lon: 11.0 };
        const prev = { lat: 59.95, lon: 10.75 };
        const curr = { lat: 60.05, lon: 10.75 };
        const hit = segmentsIntersect(prev, curr, gateA, gateB);
        expect(hit?.intersects).toBe(true);
        expect(hit?.fractionA).toBeCloseTo(0.5, 1);
        expect(hit?.point.lat).toBeCloseTo(60.0, 2);
        expect(hit?.point.lon).toBeCloseTo(10.75, 2);
    });

    it('returns non-intersect when segments are apart', () => {
        const gateA = { lat: 60.0, lon: 10.5 };
        const gateB = { lat: 60.0, lon: 11.0 };
        const prev = { lat: 61.0, lon: 10.75 };
        const curr = { lat: 62.0, lon: 10.75 };
        const hit = segmentsIntersect(prev, curr, gateA, gateB);
        expect(hit?.intersects).toBe(false);
    });

    it('returns null for parallel segments', () => {
        const hit = segmentsIntersect(
            { lat: 60, lon: 10 },
            { lat: 60, lon: 11 },
            { lat: 60.1, lon: 10 },
            { lat: 60.1, lon: 11 },
        );
        expect(hit).toBeNull();
    });

    it('returns null for degenerate (identical) points on A', () => {
        const hit = segmentsIntersect(
            { lat: 60, lon: 10 },
            { lat: 60, lon: 10 },
            { lat: 59, lon: 10 },
            { lat: 61, lon: 10 },
        );
        expect(hit).toBeNull();
    });

    it('rejects hit at t just outside [0,1]', () => {
        // prev→curr ends BEFORE the gate
        const gateA = { lat: 60.0, lon: 10.5 };
        const gateB = { lat: 60.0, lon: 11.0 };
        const prev = { lat: 59.0, lon: 10.75 };
        const curr = { lat: 59.5, lon: 10.75 };
        const hit = segmentsIntersect(prev, curr, gateA, gateB);
        expect(hit?.intersects).toBe(false);
    });
});

describe('crossingDirection', () => {
    // Convention: observer stands at gateA facing gateB. Their left hand points to
    // the positive-cross-product side (north when gate runs east). "left-to-right"
    // means the object moves from the observer's left to the observer's right.
    it('labels north→south crossing of east-running gate as left-to-right', () => {
        const gateA = { lat: 60.0, lon: 10.5 };
        const gateB = { lat: 60.0, lon: 11.0 };
        const prev = { lat: 60.1, lon: 10.75 }; // left side of gate (north)
        const curr = { lat: 59.9, lon: 10.75 }; // right side (south)
        expect(crossingDirection(prev, curr, gateA, gateB)).toBe('left-to-right');
    });

    it('labels south→north crossing of east-running gate as right-to-left', () => {
        const gateA = { lat: 60.0, lon: 10.5 };
        const gateB = { lat: 60.0, lon: 11.0 };
        const prev = { lat: 59.9, lon: 10.75 };
        const curr = { lat: 60.1, lon: 10.75 };
        expect(crossingDirection(prev, curr, gateA, gateB)).toBe('right-to-left');
    });
});

describe('isNearPole', () => {
    it('returns true for vertex above 80°', () => {
        expect(
            isNearPole([
                { lat: 81, lon: 0 },
                { lat: 79, lon: 0 },
            ]),
        ).toBe(true);
    });

    it('returns false for temperate vertices', () => {
        expect(
            isNearPole([
                { lat: 60, lon: 10 },
                { lat: 62, lon: 11 },
            ]),
        ).toBe(false);
    });
});

describe('crossesAntimeridian', () => {
    it('detects a segment spanning 179→-179', () => {
        expect(
            crossesAntimeridian([
                { lat: 0, lon: 179 },
                { lat: 0, lon: -179 },
            ]),
        ).toBe(true);
    });

    it('returns false for normal segments', () => {
        expect(
            crossesAntimeridian([
                { lat: 60, lon: 10 },
                { lat: 60, lon: 11 },
            ]),
        ).toBe(false);
    });
});

describe('measureSegments + autoSplitSegments', () => {
    it('flags Oslo–Bergen single segment as too long', () => {
        const segs = measureSegments([
            { lat: 59.9139, lon: 10.7522 },
            { lat: 60.3913, lon: 5.3221 },
        ]);
        expect(segs).toHaveLength(1);
        expect(segs[0].tooLong).toBe(true);
        expect(segs[0].km).toBeGreaterThan(300);
    });

    it('auto-splits a long segment into sub-100km chunks', () => {
        const split = autoSplitSegments([
            { lat: 59.9139, lon: 10.7522 },
            { lat: 60.3913, lon: 5.3221 },
        ]);
        expect(split.length).toBeGreaterThan(2);
        const remeasured = measureSegments(split);
        expect(remeasured.every((s) => !s.tooLong)).toBe(true);
    });

    it('passes through short segments unchanged', () => {
        const input = [
            { lat: 60, lon: 10 },
            { lat: 60.1, lon: 10.1 },
        ];
        expect(autoSplitSegments(input)).toEqual(input);
    });
});
