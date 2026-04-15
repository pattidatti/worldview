import { describe, expect, it } from 'vitest';
import type { Gate } from '@/types/gate';
import { detectCrossings, type EntityPosition } from '../crossingDetector';

const baseGate: Gate = {
    id: 'gate-osl',
    name: 'OSL innflyvning',
    vertices: [
        { lat: 60.0, lon: 10.5 },
        { lat: 60.0, lon: 11.0 },
    ],
    color: '#4a9eff',
    visible: true,
    createdAt: 1,
};

function mkMap(
    entries: Array<[string, EntityPosition]>,
): Map<string, EntityPosition> {
    return new Map(entries);
}

describe('detectCrossings', () => {
    const options = { maxStalenessMs: 20_000 };

    it('emits event when entity crosses a visible gate', () => {
        const prev = mkMap([
            ['icao-1', { pos: { lat: 59.95, lon: 10.75 }, ts: 1000 }],
        ]);
        const curr = mkMap([
            ['icao-1', { pos: { lat: 60.05, lon: 10.75 }, ts: 11_000 }],
        ]);
        const events = detectCrossings(prev, curr, [baseGate], 'flight', options);
        expect(events).toHaveLength(1);
        expect(events[0].gateId).toBe('gate-osl');
        expect(events[0].entityId).toBe('icao-1');
        expect(events[0].entityType).toBe('flight');
        expect(events[0].direction).toBe('right-to-left');
        expect(events[0].timestamp).toBeGreaterThan(1000);
        expect(events[0].timestamp).toBeLessThan(11_000);
    });

    it('returns empty when entity does not cross', () => {
        const prev = mkMap([
            ['icao-1', { pos: { lat: 58.0, lon: 10.75 }, ts: 0 }],
        ]);
        const curr = mkMap([
            ['icao-1', { pos: { lat: 58.5, lon: 10.75 }, ts: 10_000 }],
        ]);
        expect(detectCrossings(prev, curr, [baseGate], 'flight', options)).toEqual(
            [],
        );
    });

    it('skips gates that are not visible', () => {
        const prev = mkMap([
            ['icao-1', { pos: { lat: 59.95, lon: 10.75 }, ts: 0 }],
        ]);
        const curr = mkMap([
            ['icao-1', { pos: { lat: 60.05, lon: 10.75 }, ts: 10_000 }],
        ]);
        const hidden = { ...baseGate, visible: false };
        expect(detectCrossings(prev, curr, [hidden], 'flight', options)).toEqual(
            [],
        );
    });

    it('skips when prev is missing (new entity)', () => {
        const prev = mkMap([]);
        const curr = mkMap([
            ['icao-1', { pos: { lat: 60.05, lon: 10.75 }, ts: 10_000 }],
        ]);
        expect(detectCrossings(prev, curr, [baseGate], 'flight', options)).toEqual(
            [],
        );
    });

    it('ignores stale prev (dt > maxStalenessMs)', () => {
        const prev = mkMap([
            ['icao-1', { pos: { lat: 59.95, lon: 10.75 }, ts: 0 }],
        ]);
        const curr = mkMap([
            ['icao-1', { pos: { lat: 60.05, lon: 10.75 }, ts: 30_000 }],
        ]);
        expect(detectCrossings(prev, curr, [baseGate], 'flight', options)).toEqual(
            [],
        );
    });

    it('rejects gates near poles', () => {
        const polar: Gate = {
            ...baseGate,
            vertices: [
                { lat: 85, lon: 10 },
                { lat: 85, lon: 11 },
            ],
        };
        const prev = mkMap([
            ['icao-1', { pos: { lat: 84.5, lon: 10.5 }, ts: 0 }],
        ]);
        const curr = mkMap([
            ['icao-1', { pos: { lat: 85.5, lon: 10.5 }, ts: 10_000 }],
        ]);
        expect(detectCrossings(prev, curr, [polar], 'flight', options)).toEqual(
            [],
        );
    });

    it('rejects antimeridian-crossing gates', () => {
        const wrap: Gate = {
            ...baseGate,
            vertices: [
                { lat: 0, lon: 179 },
                { lat: 0, lon: -179 },
            ],
        };
        const prev = mkMap([
            ['icao-1', { pos: { lat: -0.1, lon: 179.5 }, ts: 0 }],
        ]);
        const curr = mkMap([
            ['icao-1', { pos: { lat: 0.1, lon: 179.5 }, ts: 10_000 }],
        ]);
        expect(detectCrossings(prev, curr, [wrap], 'flight', options)).toEqual(
            [],
        );
    });

    it('assigns deterministic event IDs (idempotent across replays)', () => {
        const prev = mkMap([
            ['icao-1', { pos: { lat: 59.95, lon: 10.75 }, ts: 1000 }],
        ]);
        const curr = mkMap([
            ['icao-1', { pos: { lat: 60.05, lon: 10.75 }, ts: 11_000 }],
        ]);
        const a = detectCrossings(prev, curr, [baseGate], 'flight', options);
        const b = detectCrossings(prev, curr, [baseGate], 'flight', options);
        expect(a[0].id).toBe(b[0].id);
    });

    it('emits one event per crossed segment for multi-vertex gates', () => {
        const twoSeg: Gate = {
            ...baseGate,
            vertices: [
                { lat: 60.0, lon: 10.5 },
                { lat: 60.0, lon: 10.8 },
                { lat: 60.0, lon: 11.2 },
            ],
        };
        const prev = mkMap([
            ['icao-1', { pos: { lat: 59.95, lon: 10.75 }, ts: 0 }],
        ]);
        const curr = mkMap([
            ['icao-1', { pos: { lat: 60.05, lon: 10.75 }, ts: 10_000 }],
        ]);
        const events = detectCrossings(prev, curr, [twoSeg], 'flight', options);
        expect(events).toHaveLength(1);
        expect(events[0].segmentIndex).toBe(0);
    });
});
