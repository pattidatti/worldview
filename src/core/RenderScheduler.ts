import type { Viewer } from 'cesium';

// Fast 30fps animasjons-cadence — tilstrekkelig for fade/bounce-effekter, halverer
// requestRender-trafikk vs 60fps.
const ANIM_FRAME_MS = 33;

export interface AnimJob {
    durationMs: number;
    /** t ∈ [0,1], rå fremdrift — easing gjøres hos kalleren. */
    onTick: (t: number) => void;
    onDone?: () => void;
}

interface InternalJob extends AnimJob {
    viewer: Viewer;
    start: number;
}

interface ContinuousHold {
    hz: 30 | 60;
    tag: string;
}

/**
 * Sentral eier av `scene.requestRender`-behov (jf. docs/ARCHITECTURE-VISION.md).
 * Tre kanaler:
 *  - `requestFrame()` — koalesert énframe-forespørsel (maks én requestRender per mikrotask)
 *  - `acquireContinuous(hz, tag)` — kontinuerlig behov (shader-løkker, radar-sveip);
 *    ÉN intern interval på høyeste aktive hz uansett antall holdere
 *  - `animate(job)` — delt animasjonsdriver for fade/bounce/pulse; alle jobber deles
 *    av én 30fps-timer med maks én requestRender per viewer per tick
 *
 * Eksisterende spredte requestRender-kall fungerer fortsatt — scheduleren koalescerer
 * kun det som meldes inn her. Lag migreres over gradvis.
 */
export class RenderScheduler {
    private viewer: Viewer | null = null;

    // requestFrame-koalescering
    private framePending = false;

    // animate-driver (portert fra entityFade.ts — én timer for alle jobber)
    private jobs = new Set<InternalJob>();
    private animDriverId: ReturnType<typeof setInterval> | null = null;
    private scratchViewers = new Set<Viewer>();

    // Kontinuerlige behov
    private holds = new Map<number, ContinuousHold>();
    private holdSeq = 0;
    private continuousId: ReturnType<typeof setInterval> | null = null;
    private continuousHz = 0;

    attach(viewer: Viewer): void {
        this.viewer = viewer;
    }

    detach(): void {
        this.viewer = null;
        this.jobs.clear();
        this.holds.clear();
        this.stopAnimDriver();
        this.stopContinuous();
        this.framePending = false;
    }

    /** Koalesert énframe-forespørsel: N kall i samme mikrotask → én requestRender. */
    requestFrame(): void {
        if (this.framePending) return;
        this.framePending = true;
        queueMicrotask(() => {
            this.framePending = false;
            this.render(this.viewer);
        });
    }

    /**
     * Meld inn et kontinuerlig render-behov. Returnerer release-funksjon.
     * Én intern interval kjører på høyeste aktive hz og kaller requestRender
     * én gang per tick uansett antall holdere.
     */
    acquireContinuous(hz: 30 | 60, tag: string): () => void {
        const key = ++this.holdSeq;
        this.holds.set(key, { hz, tag });
        this.reconcileContinuous();
        let released = false;
        return () => {
            if (released) return;
            released = true;
            this.holds.delete(key);
            this.reconcileContinuous();
        };
    }

    /**
     * Delt animasjonsdriver: alle jobber tikker på samme 30fps-timer, med maks én
     * requestRender per viewer per tick. `viewer` overstyrer attached viewer —
     * brukes av entityFade som får viewer per kall.
     */
    animate(job: AnimJob, viewer?: Viewer): void {
        const target = viewer ?? this.viewer;
        if (!target) return;
        this.jobs.add({ ...job, viewer: target, start: performance.now() });
        if (this.animDriverId === null) {
            this.animDriverId = setInterval(() => this.tickAnimDriver(), ANIM_FRAME_MS);
        }
    }

    /** Debug/test: aktive continuous-tags. */
    getActiveTags(): string[] {
        return [...this.holds.values()].map((h) => h.tag);
    }

    private tickAnimDriver(): void {
        const now = performance.now();
        this.scratchViewers.clear();
        for (const job of this.jobs) {
            if (job.viewer.isDestroyed()) {
                this.jobs.delete(job);
                continue;
            }
            const t = Math.min((now - job.start) / job.durationMs, 1);
            job.onTick(t);
            this.scratchViewers.add(job.viewer);
            if (t >= 1) {
                this.jobs.delete(job);
                job.onDone?.();
            }
        }
        for (const v of this.scratchViewers) v.scene.requestRender();
        if (this.jobs.size === 0) this.stopAnimDriver();
    }

    private reconcileContinuous(): void {
        let maxHz = 0;
        for (const hold of this.holds.values()) maxHz = Math.max(maxHz, hold.hz);
        if (maxHz === this.continuousHz) return;
        this.stopContinuous();
        this.continuousHz = maxHz;
        if (maxHz > 0) {
            this.continuousId = setInterval(() => this.render(this.viewer), 1000 / maxHz);
        }
    }

    private stopAnimDriver(): void {
        if (this.animDriverId !== null) {
            clearInterval(this.animDriverId);
            this.animDriverId = null;
        }
    }

    private stopContinuous(): void {
        if (this.continuousId !== null) {
            clearInterval(this.continuousId);
            this.continuousId = null;
        }
        this.continuousHz = 0;
    }

    private render(viewer: Viewer | null): void {
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }
}

export const renderScheduler = new RenderScheduler();
