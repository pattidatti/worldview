import { describe, it, expect } from 'vitest';
import { binToDensityCells } from '../densityGrid';

describe('binToDensityCells', () => {
    it('binner punkter i samme 1°-celle sammen', () => {
        const cells = binToDensityCells([
            { lon: 10.2, lat: 60.3 },
            { lon: 10.8, lat: 60.9 },
            { lon: 11.1, lat: 60.5 },
        ]);
        expect(cells).toHaveLength(2);
        const big = cells.find((c) => c.count === 2)!;
        expect(big.lon).toBeCloseTo(10.5);
        expect(big.lat).toBeCloseTo(60.5);
    });

    it('håndterer negative koordinater (Math.floor, ikke trunc)', () => {
        const cells = binToDensityCells([{ lon: -0.5, lat: -0.5 }]);
        expect(cells[0].lon).toBeCloseTo(-0.5);
        expect(cells[0].lat).toBeCloseTo(-0.5);
    });

    it('egendefinert cellestørrelse', () => {
        const cells = binToDensityCells(
            [{ lon: 1, lat: 1 }, { lon: 4, lat: 4 }],
            5,
        );
        expect(cells).toHaveLength(1);
        expect(cells[0].count).toBe(2);
        expect(cells[0].lon).toBeCloseTo(2.5);
    });

    it('tomt input gir tomt resultat', () => {
        expect(binToDensityCells([])).toEqual([]);
    });
});
