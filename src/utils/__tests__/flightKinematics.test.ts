import { describe, it, expect } from 'vitest';
import {
    extrapolateGreatCircle,
    headingToBillboardRotation,
    DR_MAX_AGE_MS,
    FLIGHT_POLL_MS,
} from '../flightKinematics';

describe('extrapolateGreatCircle', () => {
    it('dt=0 er identitet', () => {
        const p = extrapolateGreatCircle(10.5, 59.9, 137, 250, 0);
        expect(p.lon).toBe(10.5);
        expect(p.lat).toBe(59.9);
    });

    it('heading 0 (nord): ~250 m/s i 60s ≈ +0.135° lat, lon uendret', () => {
        const p = extrapolateGreatCircle(10, 60, 0, 250, 60);
        expect(p.lon).toBeCloseTo(10, 6);
        // 15 000 m / 111 194 m per grad ≈ 0.1349°
        expect(p.lat).toBeCloseTo(60 + 15_000 / 111_194.9, 4);
    });

    it('heading 90 (øst): lat uendret, lon skalert med 1/cos(lat)', () => {
        const p = extrapolateGreatCircle(10, 60, 90, 200, 30);
        expect(p.lat).toBeCloseTo(60, 6);
        // 6000 m østover ved 60°N: dLon = 6000 / (R·cos60°) rad ≈ 0.1079°
        const expected = 10 + (6000 / (6_371_000 * Math.cos(Math.PI / 3))) * (180 / Math.PI);
        expect(p.lon).toBeCloseTo(expected, 5);
    });

    it('heading 180 (sør) flytter lat negativt', () => {
        const p = extrapolateGreatCircle(10, 60, 180, 250, 60);
        expect(p.lat).toBeLessThan(60);
        expect(p.lon).toBeCloseTo(10, 6);
    });

    it('sørlig halvkule og vestlig heading', () => {
        const p = extrapolateGreatCircle(-70, -33, 270, 240, 10);
        expect(p.lon).toBeLessThan(-70);
        expect(p.lat).toBeCloseTo(-33, 6);
    });
});

describe('konstanter og hjelpere', () => {
    it('DR-cutoff er 3 missede polls', () => {
        expect(DR_MAX_AGE_MS).toBe(FLIGHT_POLL_MS * 3);
    });

    it('headingToBillboardRotation: nord=0, øst=-90° i radianer (mot klokka)', () => {
        expect(headingToBillboardRotation(0)).toBeCloseTo(0);
        expect(headingToBillboardRotation(90)).toBeCloseTo(-Math.PI / 2);
    });
});
