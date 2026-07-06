import { describe, it, expect, vi } from 'vitest';
import { LODGovernor, LODTier, tierForHeight } from '../LODGovernor';
import type { Viewer } from 'cesium';

describe('tierForHeight', () => {
    it('klassifiserer uten forrige tier', () => {
        expect(tierForHeight(10_000)).toBe(LODTier.NAER);
        expect(tierForHeight(100_000)).toBe(LODTier.LOKAL);
        expect(tierForHeight(1_000_000)).toBe(LODTier.REGION);
        expect(tierForHeight(10_000_000)).toBe(LODTier.GLOBAL);
    });

    it('grenser uten historikk: eksakt terskel tilhører tieret over', () => {
        expect(tierForHeight(25_000)).toBe(LODTier.LOKAL);
        expect(tierForHeight(24_999)).toBe(LODTier.NAER);
        expect(tierForHeight(5_000_000)).toBe(LODTier.GLOBAL);
    });

    it('hysterese ved utzooming: blir i NÆR til 10 % over terskelen', () => {
        expect(tierForHeight(26_000, LODTier.NAER)).toBe(LODTier.NAER);
        expect(tierForHeight(27_400, LODTier.NAER)).toBe(LODTier.NAER);
        expect(tierForHeight(27_600, LODTier.NAER)).toBe(LODTier.LOKAL);
    });

    it('hysterese ved innzooming: blir i LOKAL til 10 % under terskelen', () => {
        expect(tierForHeight(24_000, LODTier.LOKAL)).toBe(LODTier.LOKAL);
        expect(tierForHeight(22_400, LODTier.LOKAL)).toBe(LODTier.NAER);
    });

    it('hopp over flere tiers på én gang følger samme margin-regel', () => {
        // Fra NÆR rett til GLOBAL: langt forbi alle terskler
        expect(tierForHeight(20_000_000, LODTier.NAER)).toBe(LODTier.GLOBAL);
        // Fra GLOBAL rett til NÆR
        expect(tierForHeight(5_000, LODTier.GLOBAL)).toBe(LODTier.NAER);
    });

    it('stabil midt i et tier', () => {
        expect(tierForHeight(100_000, LODTier.LOKAL)).toBe(LODTier.LOKAL);
    });
});

function mockViewer(initialHeight: number) {
    let height = initialHeight;
    const listeners = new Set<() => void>();
    const viewer = {
        isDestroyed: () => false,
        camera: {
            get positionCartographic() {
                return { height };
            },
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
        setHeight(h: number) {
            height = h;
            for (const fn of listeners) fn();
        },
    };
}

describe('LODGovernor', () => {
    it('beregner tier ved attach og varsler kun ved tier-SKIFTE', () => {
        const { viewer, setHeight } = mockViewer(10_000_000);
        const gov = new LODGovernor();
        gov.attach(viewer);
        expect(gov.getTier()).toBe(LODTier.GLOBAL);

        const sub = vi.fn();
        gov.subscribe(sub);

        setHeight(9_000_000); // fortsatt GLOBAL
        expect(sub).not.toHaveBeenCalled();

        setHeight(1_000_000); // → REGION
        expect(sub).toHaveBeenCalledTimes(1);
        expect(sub).toHaveBeenCalledWith(LODTier.REGION, 1_000_000);
        expect(gov.getCameraHeight()).toBe(1_000_000);
        gov.detach();
    });

    it('kvote: under budsjett får alle det de ba om', () => {
        const gov = new LODGovernor();
        expect(gov.requestQuota('labels', 'flights', 40)).toBe(40);
        expect(gov.requestQuota('labels', 'ships', 20)).toBe(20);
    });

    it('kvote: over budsjett fordeles proporsjonalt', () => {
        const gov = new LODGovernor();
        gov.requestQuota('labels', 'flights', 90);
        // flights 90 + ships 30 = 120 ønsket, budsjett 60 → 3/4 og 1/4
        expect(gov.requestQuota('labels', 'ships', 30)).toBe(15);
        expect(gov.requestQuota('labels', 'flights', 90)).toBe(45);
    });

    it('release frigjør kvote til gjenværende renderere', () => {
        const gov = new LODGovernor();
        gov.requestQuota('labels', 'flights', 90);
        gov.requestQuota('labels', 'ships', 30);
        gov.releaseQuota('labels', 'flights');
        expect(gov.requestQuota('labels', 'ships', 30)).toBe(30);
    });

    it('kvote-typer er adskilte budsjetter', () => {
        const gov = new LODGovernor();
        expect(gov.requestQuota('particles', 'ships', 20)).toBe(8);
        expect(gov.requestQuota('polylines', 'flights', 400)).toBe(400);
    });
});
