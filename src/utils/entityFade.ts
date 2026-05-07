import { type Entity, type Viewer, ConstantProperty, JulianDate, Color } from 'cesium';

function smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
}

// Fast 30fps animasjons-cadence — tilstrekkelig for fade/bounce-effekter, halverer
// requestRender-trafikk vs 60fps. Bruk setInterval + ConstantProperty i stedet for
// CallbackProperty: unngår per-frame eval-overhead og gjør animasjonen uavhengig av
// hvor ofte Cesium trigger CallbackProperty.getValue().
const FRAME_MS = 33;

function animate(
    durationMs: number,
    viewer: Viewer,
    onTick: (t: number) => void,
    onDone?: () => void,
): void {
    const start = performance.now();
    const id = window.setInterval(() => {
        if (viewer.isDestroyed()) {
            clearInterval(id);
            return;
        }
        const t = Math.min((performance.now() - start) / durationMs, 1);
        onTick(t);
        viewer.scene.requestRender();
        if (t >= 1) {
            clearInterval(id);
            onDone?.();
        }
    }, FRAME_MS);
}

/**
 * Fader inn billboard.color og/eller point.color fra alpha 0 → full alpha.
 * Bruker setInterval (30fps) + ConstantProperty for å unngå per-frame
 * CallbackProperty-eval. Kall ETTER at entity er lagt til DataSource.
 */
export function fadeInEntity(entity: Entity, viewer: Viewer, durationMs = 600): void {
    const jd = JulianDate.fromDate(new Date());
    let target: Color | null = null;
    let pointTarget: Color | null = null;

    if (entity.billboard) {
        const existing = entity.billboard.color;
        target = existing
            ? Color.clone((existing as ConstantProperty).getValue(jd) as Color ?? Color.WHITE)
            : Color.WHITE.clone();
        (entity.billboard as unknown as Record<string, unknown>).color = new ConstantProperty(target.withAlpha(0));
    }
    if (entity.point?.color) {
        pointTarget = Color.clone((entity.point.color as ConstantProperty).getValue(jd) as Color ?? Color.WHITE);
        (entity.point as unknown as Record<string, unknown>).color = new ConstantProperty(pointTarget.withAlpha(0));
    }

    animate(
        durationMs,
        viewer,
        (t) => {
            const a = smoothstep(t);
            if (target && entity.billboard) {
                (entity.billboard as unknown as Record<string, unknown>).color = new ConstantProperty(target.withAlpha(a * target.alpha));
            }
            if (pointTarget && entity.point) {
                (entity.point as unknown as Record<string, unknown>).color = new ConstantProperty(pointTarget.withAlpha(a * pointTarget.alpha));
            }
        },
        () => {
            if (target && entity.billboard) {
                (entity.billboard as unknown as Record<string, unknown>).color = new ConstantProperty(target);
            }
            if (pointTarget && entity.point) {
                (entity.point as unknown as Record<string, unknown>).color = new ConstantProperty(pointTarget);
            }
        },
    );
}

/**
 * Fader ut billboard.color og/eller point.color fra nåværende alpha → 0.
 * Kaller onComplete etter animasjonsslutt — bruk til ds.entities.removeById().
 */
export function fadeOutEntity(
    entity: Entity,
    viewer: Viewer,
    durationMs = 400,
    onComplete?: () => void,
): void {
    const jd = JulianDate.fromDate(new Date());
    let base: Color | null = null;
    let pointBase: Color | null = null;

    if (entity.billboard) {
        const existing = entity.billboard.color;
        base = existing
            ? Color.clone((existing as ConstantProperty).getValue(jd) as Color ?? Color.WHITE)
            : Color.WHITE.clone();
    }
    if (entity.point?.color) {
        pointBase = Color.clone((entity.point.color as ConstantProperty).getValue(jd) as Color ?? Color.WHITE);
    }

    animate(
        durationMs,
        viewer,
        (t) => {
            const a = 1 - smoothstep(t);
            if (base && entity.billboard) {
                (entity.billboard as unknown as Record<string, unknown>).color = new ConstantProperty(base.withAlpha(a * base.alpha));
            }
            if (pointBase && entity.point) {
                (entity.point as unknown as Record<string, unknown>).color = new ConstantProperty(pointBase.withAlpha(a * pointBase.alpha));
            }
        },
        () => onComplete?.(),
    );
}

/**
 * Scale-bounce for billboard: 0.5 → 1.15 → 1.0 (spring-effekt).
 * Brukes av NewsLayer for å gi ikoner en livlig inngang.
 */
export function bounceInEntity(entity: Entity, viewer: Viewer, durationMs = 450): void {
    if (!entity.billboard) return;

    animate(
        durationMs,
        viewer,
        (t) => {
            let scale: number;
            if (t < 0.7) {
                const p = t / 0.7;
                scale = 0.5 + smoothstep(p) * 0.65;
            } else {
                const p = (t - 0.7) / 0.3;
                scale = 1.15 - smoothstep(p) * 0.15;
            }
            if (entity.billboard) {
                (entity.billboard as unknown as Record<string, unknown>).scale = new ConstantProperty(scale);
            }
        },
        () => {
            if (entity.billboard) {
                (entity.billboard as unknown as Record<string, unknown>).scale = new ConstantProperty(1.0);
            }
        },
    );
}
