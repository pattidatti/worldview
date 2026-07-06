import type { Viewer } from 'cesium';

/**
 * Fire globale detaljnivåer etter kamerahøyde (jf. docs/ARCHITECTURE-VISION.md):
 * GLOBAL (> 5 000 km) → REGION (250–5 000 km) → LOKAL (25–250 km) → NÆR (< 25 km).
 */
export enum LODTier {
    GLOBAL = 0,
    REGION = 1,
    LOKAL = 2,
    NAER = 3,
}

const TIER_CEILING_M: Record<LODTier, number> = {
    [LODTier.NAER]: 25_000,
    [LODTier.LOKAL]: 250_000,
    [LODTier.REGION]: 5_000_000,
    [LODTier.GLOBAL]: Infinity,
};

/** ~10 % hysterese rundt tersklene så tier ikke flapper ved grensen. */
const HYSTERESIS = 0.1;

function rawTierForHeight(height: number): LODTier {
    if (height < TIER_CEILING_M[LODTier.NAER]) return LODTier.NAER;
    if (height < TIER_CEILING_M[LODTier.LOKAL]) return LODTier.LOKAL;
    if (height < TIER_CEILING_M[LODTier.REGION]) return LODTier.REGION;
    return LODTier.GLOBAL;
}

/**
 * Tier for kamerahøyde med hysterese: bytte skjer først når høyden har
 * passert terskelen med ~10 % margin i retningen bort fra forrige tier.
 * Ren funksjon — testbar uten Cesium.
 */
export function tierForHeight(height: number, prevTier: LODTier | null = null): LODTier {
    const raw = rawTierForHeight(height);
    if (prevTier === null || raw === prevTier) return raw;

    // NB: enum-verdiene er omvendt av høyde — NÆR (3) er lavest kamerahøyde.
    if (raw < prevTier) {
        // Zoomer ut (mot grovere tier): krev at høyden passerer prev-tierens
        // tak med margin
        const ceiling = TIER_CEILING_M[prevTier];
        return height > ceiling * (1 + HYSTERESIS) ? raw : prevTier;
    }
    // Zoomer inn (mot finere tier): krev at høyden går under den nye tierens
    // tak med margin
    const ceiling = TIER_CEILING_M[raw];
    return height < ceiling * (1 - HYSTERESIS) ? raw : prevTier;
}

export type QuotaKind = 'labels' | 'polylines' | 'particles';

/** Sentrale budsjetter — den visuelle pyramidens harde tak, uansett datamengde. */
const QUOTA_BUDGET: Record<QuotaKind, number> = {
    labels: 60,
    polylines: 500,
    particles: 8,
};

type TierSubscriber = (tier: LODTier, height: number) => void;

/**
 * «Detail Governor»: eier kamerahøyde-tier og deler ut render-kvoter til
 * renderere. v1-fordeling er proporsjonal med ønsket mengde når summen
 * overstiger budsjettet; nærmest-kamera-prioritering forfines i fase C/E.
 */
export class LODGovernor {
    private viewer: Viewer | null = null;
    private removeListener: (() => void) | null = null;
    private tier: LODTier = LODTier.GLOBAL;
    private cameraHeight = Infinity;
    private subscribers = new Set<TierSubscriber>();
    private wants = new Map<QuotaKind, Map<string, number>>();

    attach(viewer: Viewer): void {
        this.detach();
        this.viewer = viewer;
        const update = () => this.updateTier();
        this.removeListener = viewer.camera.changed.addEventListener(update);
        this.updateTier();
    }

    detach(): void {
        this.removeListener?.();
        this.removeListener = null;
        this.viewer = null;
    }

    getTier(): LODTier {
        return this.tier;
    }

    getCameraHeight(): number {
        return this.cameraHeight;
    }

    /** Varsles KUN ved tier-skifte, ikke per kamerabevegelse. */
    subscribe(fn: TierSubscriber): () => void {
        this.subscribers.add(fn);
        return () => this.subscribers.delete(fn);
    }

    /**
     * Be om kvote for en ressurstype. Returnerer tildelt antall — ved
     * overtegning skaleres alle renderere proporsjonalt. Kall på nytt ved
     * tier-skifte eller endret behov; kall releaseQuota ved detach.
     */
    requestQuota(kind: QuotaKind, rendererId: string, wanted: number): number {
        let byRenderer = this.wants.get(kind);
        if (!byRenderer) {
            byRenderer = new Map();
            this.wants.set(kind, byRenderer);
        }
        byRenderer.set(rendererId, Math.max(0, wanted));
        return this.grantFor(kind, rendererId);
    }

    releaseQuota(kind: QuotaKind, rendererId: string): void {
        this.wants.get(kind)?.delete(rendererId);
    }

    private grantFor(kind: QuotaKind, rendererId: string): number {
        const byRenderer = this.wants.get(kind)!;
        const budget = QUOTA_BUDGET[kind];
        let total = 0;
        for (const w of byRenderer.values()) total += w;
        const wanted = byRenderer.get(rendererId) ?? 0;
        if (total <= budget) return wanted;
        return Math.floor((wanted / total) * budget);
    }

    private updateTier(): void {
        const v = this.viewer;
        if (!v || v.isDestroyed()) return;
        const height = v.camera.positionCartographic.height;
        this.cameraHeight = height;
        const next = tierForHeight(height, this.tier);
        if (next === this.tier) return;
        this.tier = next;
        for (const fn of this.subscribers) fn(next, height);
    }
}

export const lodGovernor = new LODGovernor();
