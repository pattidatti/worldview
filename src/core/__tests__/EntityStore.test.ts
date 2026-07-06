import { describe, it, expect, vi } from 'vitest';
import { EntityStore, entityStores, type EntityDelta } from '../EntityStore';

interface TestEntity {
    id: string;
    name: string;
}

const LAYOUT = { stride: 3, fields: ['lon', 'lat', 'alt'] } as const;

describe('EntityStore', () => {
    it('applyDelta upserter, fjerner og bumper version', () => {
        const store = new EntityStore<TestEntity>('test');
        expect(store.version).toBe(0);

        store.applyDelta({ upserts: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], removes: [] });
        expect(store.version).toBe(1);
        expect(store.size).toBe(2);
        expect(store.get('a')?.name).toBe('A');

        store.applyDelta({ upserts: [{ id: 'a', name: 'A2' }], removes: ['b'] });
        expect(store.version).toBe(2);
        expect(store.get('a')?.name).toBe('A2');
        expect(store.get('b')).toBeUndefined();
    });

    it('tom delta er no-op (ingen version-bump, ingen varsling)', () => {
        const store = new EntityStore<TestEntity>('test');
        const sub = vi.fn();
        store.subscribe(sub);
        store.applyDelta({ upserts: [], removes: [] });
        expect(store.version).toBe(0);
        expect(sub).not.toHaveBeenCalled();
    });

    it('delta-subscribers får delta + version; avmelding stopper varsling', () => {
        const store = new EntityStore<TestEntity>('test');
        const deltas: EntityDelta<TestEntity>[] = [];
        const unsub = store.subscribe((d) => deltas.push(d));

        store.applyDelta({ upserts: [{ id: 'a', name: 'A' }], removes: [] });
        expect(deltas).toHaveLength(1);
        unsub();
        store.applyDelta({ upserts: [{ id: 'b', name: 'B' }], removes: [] });
        expect(deltas).toHaveLength(1);
    });

    it('roster + positions-runde: slot-oppslag og feltlesing via layout', () => {
        const store = new EntityStore<TestEntity>('fly', LAYOUT);
        store.setRoster(['a', 'b']);
        const buffer = new Float64Array([10.1, 59.2, 1000, 20.3, 60.4, 2000]);
        store.applyPositions(buffer);

        const pb = store.getPositionBuffer();
        expect(pb).not.toBeNull();
        const slotB = store.getSlot('b');
        expect(slotB).toBe(1);
        expect(pb!.buffer[slotB * pb!.layout.stride + 0]).toBeCloseTo(20.3);
        expect(pb!.buffer[slotB * pb!.layout.stride + 2]).toBe(2000);
        expect(store.getSlot('finnes-ikke')).toBe(-1);
    });

    it('applyPositions varsler kun positions-subscribers', () => {
        const store = new EntityStore<TestEntity>('fly', LAYOUT);
        const deltaSub = vi.fn();
        const posSub = vi.fn();
        store.subscribe(deltaSub);
        store.subscribePositions(posSub);

        store.setRoster(['a']);
        store.applyPositions(new Float64Array(3));
        expect(posSub).toHaveBeenCalledTimes(1);
        expect(deltaSub).not.toHaveBeenCalled();
    });

    it('applyPositions uten layout kaster', () => {
        const store = new EntityStore<TestEntity>('test');
        expect(() => store.applyPositions(new Float64Array(3))).toThrow(/positionLayout/);
    });

    it('clear varsler removes for alle id-er og nullstiller buffer/roster', () => {
        const store = new EntityStore<TestEntity>('fly', LAYOUT);
        store.applyDelta({ upserts: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], removes: [] });
        store.setRoster(['a', 'b']);
        store.applyPositions(new Float64Array(6));

        const deltas: EntityDelta<TestEntity>[] = [];
        store.subscribe((d) => deltas.push(d));
        store.clear();

        expect(deltas).toHaveLength(1);
        expect(deltas[0].removes.sort()).toEqual(['a', 'b']);
        expect(store.size).toBe(0);
        expect(store.getPositionBuffer()).toBeNull();
        expect(store.getSlot('a')).toBe(-1);
    });

    it('clear på tom store er no-op', () => {
        const store = new EntityStore<TestEntity>('test');
        const sub = vi.fn();
        store.subscribe(sub);
        store.clear();
        expect(sub).not.toHaveBeenCalled();
    });

    it('registry: register/get/unregister', () => {
        const store = new EntityStore<TestEntity>('registry-test');
        entityStores.register(store);
        expect(entityStores.get<TestEntity>('registry-test')).toBe(store);
        entityStores.unregister('registry-test');
        expect(entityStores.get('registry-test')).toBeUndefined();
    });
});
