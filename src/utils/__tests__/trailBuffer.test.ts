import { describe, it, expect } from 'vitest';
import { TrailBuffer } from '../trailBuffer';

describe('TrailBuffer', () => {
    it('er tom ved start', () => {
        const b = new TrailBuffer<number>(5);
        expect(b.size).toBe(0);
        expect(b.toArray()).toEqual([]);
        expect(b.tail(3)).toEqual([]);
        expect(b.head(0)).toEqual([]);
    });

    it('lagrer elementer i kronologisk rekkefølge under cap', () => {
        const b = new TrailBuffer<number>(5);
        b.push(1);
        b.push(2);
        b.push(3);
        expect(b.size).toBe(3);
        expect(b.toArray()).toEqual([1, 2, 3]);
    });

    it('overskriver eldste ved wrap-around', () => {
        const b = new TrailBuffer<number>(4);
        for (let i = 1; i <= 6; i++) b.push(i);
        expect(b.size).toBe(4);
        expect(b.toArray()).toEqual([3, 4, 5, 6]);
    });

    it('tail(n) returnerer siste n elementer kronologisk', () => {
        const b = new TrailBuffer<number>(10);
        for (let i = 1; i <= 7; i++) b.push(i);
        expect(b.tail(3)).toEqual([5, 6, 7]);
        expect(b.tail(100)).toEqual([1, 2, 3, 4, 5, 6, 7]);
        expect(b.tail(0)).toEqual([]);
    });

    it('tail(n) fungerer korrekt etter wrap-around', () => {
        const b = new TrailBuffer<number>(4);
        // Fyll til 10 elementer, buffer skal holde [7, 8, 9, 10]
        for (let i = 1; i <= 10; i++) b.push(i);
        expect(b.tail(2)).toEqual([9, 10]);
        expect(b.tail(4)).toEqual([7, 8, 9, 10]);
        expect(b.tail(10)).toEqual([7, 8, 9, 10]);
    });

    it('head(n) returnerer alle unntatt siste n kronologisk', () => {
        const b = new TrailBuffer<number>(10);
        for (let i = 1; i <= 7; i++) b.push(i);
        expect(b.head(2)).toEqual([1, 2, 3, 4, 5]);
        expect(b.head(0)).toEqual([1, 2, 3, 4, 5, 6, 7]);
        expect(b.head(7)).toEqual([]);
        expect(b.head(100)).toEqual([]);
    });

    it('head(n) fungerer korrekt etter wrap-around', () => {
        const b = new TrailBuffer<number>(4);
        for (let i = 1; i <= 10; i++) b.push(i);
        // Buffer holder [7, 8, 9, 10] kronologisk
        expect(b.head(1)).toEqual([7, 8, 9]);
        expect(b.head(2)).toEqual([7, 8]);
        expect(b.head(4)).toEqual([]);
    });

    it('tail + head dekker hele bufferen uten overlapp', () => {
        const b = new TrailBuffer<number>(5);
        for (let i = 1; i <= 8; i++) b.push(i);
        const splitAt = 3;
        const head = b.head(splitAt);
        const tail = b.tail(splitAt);
        expect([...head, ...tail]).toEqual(b.toArray());
    });

    it('clear() nullstiller bufferen', () => {
        const b = new TrailBuffer<number>(3);
        b.push(1);
        b.push(2);
        b.clear();
        expect(b.size).toBe(0);
        expect(b.toArray()).toEqual([]);
        b.push(99);
        expect(b.toArray()).toEqual([99]);
    });

    it('håndterer generisk type', () => {
        const b = new TrailBuffer<{ x: number }>(2);
        b.push({ x: 1 });
        b.push({ x: 2 });
        b.push({ x: 3 });
        expect(b.toArray()).toEqual([{ x: 2 }, { x: 3 }]);
    });
});
