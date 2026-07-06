import { type Viewer, Math as CesiumMath, Rectangle } from 'cesium';

export interface Viewport {
    west: number;
    south: number;
    east: number;
    north: number;
}

export function viewportToRect(vp: Viewport): Rectangle {
    return Rectangle.fromDegrees(vp.west, vp.south, vp.east, vp.north);
}

/**
 * Zoom-relativ terskel: 10 % av viewport-spennet, med gulv på 0.05°.
 * En fast grense (tidligere 0.5°) ga fetch-storm ved global zoom (ethvert
 * lite drag flyttet kantene > 0.5° og trigget refetch i alle viewport-
 * drevne lag) og ~55 km panorering før refresh ved by-zoom (stale data).
 */
export function viewportsEqual(a: Viewport | null, b: Viewport): boolean {
    if (!a) return false;
    const tolLon = Math.max(Math.abs(b.east - b.west), 0.05) * 0.1;
    const tolLat = Math.max(Math.abs(b.north - b.south), 0.05) * 0.1;
    return (
        Math.abs(a.west - b.west) < tolLon &&
        Math.abs(a.south - b.south) < tolLat &&
        Math.abs(a.east - b.east) < tolLon &&
        Math.abs(a.north - b.north) < tolLat
    );
}

interface Subscriber {
    fn: (vp: Viewport) => void;
    debounceMs: number;
    timeout: ReturnType<typeof setTimeout> | undefined;
    /** Sist leverte viewport for DENNE subscriberen — terskelen vurderes per
     *  kallsted, akkurat som da hver useViewport-instans hadde egen ref. */
    last: Viewport | null;
}

/**
 * ÉN camera.changed-lytter som betjener alle viewport-konsumenter — erstatter
 * de ~14 uavhengige lytterne+debounce-timerne useViewport-instansene holdt
 * (jf. docs/ARCHITECTURE-VISION.md). Hver subscriber beholder egen debounce og
 * egen endringsterskel, så semantikken per kallsted er identisk med før.
 */
export class ViewportService {
    private viewer: Viewer | null = null;
    private removeListener: (() => void) | null = null;
    private subscribers = new Set<Subscriber>();

    attach(viewer: Viewer): void {
        this.detach();
        this.viewer = viewer;
        this.removeListener = viewer.camera.changed.addEventListener(() => {
            for (const sub of this.subscribers) this.schedule(sub);
        });
        // Eksisterende subscribers (lazy-abonnenter fra før attach) får initial verdi
        for (const sub of this.subscribers) this.deliver(sub);
    }

    detach(): void {
        this.removeListener?.();
        this.removeListener = null;
        this.viewer = null;
        for (const sub of this.subscribers) {
            if (sub.timeout !== undefined) clearTimeout(sub.timeout);
            sub.timeout = undefined;
        }
    }

    getCurrent(): Viewport | null {
        return this.compute();
    }

    /**
     * Abonner på viewport-endringer. Leverer umiddelbart hvis kameraet er
     * tilgjengelig (matcher useViewports initial compute), deretter debounced
     * per subscriber ved kamerabevegelse. Returnerer unsubscribe-funksjon.
     */
    subscribe(fn: (vp: Viewport) => void, debounceMs: number = 1000): () => void {
        const sub: Subscriber = { fn, debounceMs, timeout: undefined, last: null };
        this.subscribers.add(sub);
        this.deliver(sub);
        return () => {
            if (sub.timeout !== undefined) clearTimeout(sub.timeout);
            this.subscribers.delete(sub);
        };
    }

    private schedule(sub: Subscriber): void {
        if (sub.timeout !== undefined) clearTimeout(sub.timeout);
        sub.timeout = setTimeout(() => {
            sub.timeout = undefined;
            this.deliver(sub);
        }, sub.debounceMs);
    }

    private deliver(sub: Subscriber): void {
        const next = this.compute();
        if (!next) return;
        if (viewportsEqual(sub.last, next)) return;
        sub.last = next;
        sub.fn(next);
    }

    private compute(): Viewport | null {
        const v = this.viewer;
        if (!v || v.isDestroyed()) return null;
        const rect = v.camera.computeViewRectangle();
        if (!rect) return null;
        return {
            west: CesiumMath.toDegrees(rect.west),
            south: CesiumMath.toDegrees(rect.south),
            east: CesiumMath.toDegrees(rect.east),
            north: CesiumMath.toDegrees(rect.north),
        };
    }
}

export const viewportService = new ViewportService();
