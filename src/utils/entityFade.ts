import { type Entity, type Viewer, CallbackProperty, ConstantProperty, JulianDate, Color } from 'cesium';

function smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
}

function startJd(): JulianDate {
    return JulianDate.fromDate(new Date());
}

/**
 * Fader inn billboard.color og/eller point.color fra alpha 0 → full alpha.
 * Bruker CallbackProperty-mønsteret fra pulseRing.ts (JulianDate, self-kickback).
 * Kall ETTER at entity er lagt til DataSource.
 */
export function fadeInEntity(entity: Entity, viewer: Viewer, durationMs = 600): void {
    const jd = startJd();
    const durationS = durationMs / 1000;

    if (entity.billboard) {
        const existing = entity.billboard.color;
        const target = existing
            ? Color.clone((existing as ConstantProperty).getValue(jd) as Color ?? Color.WHITE)
            : Color.WHITE.clone();
        const targetAlpha = target.alpha;

        const cb = new CallbackProperty((time: JulianDate | undefined) => {
            const t = Math.min((time ? JulianDate.secondsDifference(time, jd) : 0) / durationS, 1);
            if (t < 1 && !viewer.isDestroyed()) viewer.scene.requestRender();
            return target.withAlpha(smoothstep(t) * targetAlpha);
        }, false);
        (entity.billboard as unknown as Record<string, unknown>).color = cb;

        setTimeout(() => {
            if (!viewer.isDestroyed() && entity.billboard)
                (entity.billboard as unknown as Record<string, unknown>).color = new ConstantProperty(target.withAlpha(targetAlpha));
            if (!viewer.isDestroyed()) viewer.scene.requestRender();
        }, durationMs + 50);
    }

    if (entity.point?.color) {
        const target = Color.clone((entity.point.color as ConstantProperty).getValue(jd) as Color ?? Color.WHITE);
        const targetAlpha = target.alpha;

        const cb = new CallbackProperty((time: JulianDate | undefined) => {
            const t = Math.min((time ? JulianDate.secondsDifference(time, jd) : 0) / durationS, 1);
            if (t < 1 && !viewer.isDestroyed()) viewer.scene.requestRender();
            return target.withAlpha(smoothstep(t) * targetAlpha);
        }, false);
        (entity.point as unknown as Record<string, unknown>).color = cb;

        setTimeout(() => {
            if (!viewer.isDestroyed() && entity.point)
                (entity.point as unknown as Record<string, unknown>).color = new ConstantProperty(target.withAlpha(targetAlpha));
            if (!viewer.isDestroyed()) viewer.scene.requestRender();
        }, durationMs + 50);
    }

    viewer.scene.requestRender();
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
    const jd = startJd();
    const durationS = durationMs / 1000;

    if (entity.billboard) {
        const existing = entity.billboard.color;
        const base = existing
            ? Color.clone((existing as ConstantProperty).getValue(jd) as Color ?? Color.WHITE)
            : Color.WHITE.clone();
        const baseAlpha = base.alpha;

        const cb = new CallbackProperty((time: JulianDate | undefined) => {
            const t = Math.min((time ? JulianDate.secondsDifference(time, jd) : 0) / durationS, 1);
            if (t < 1 && !viewer.isDestroyed()) viewer.scene.requestRender();
            return base.withAlpha((1 - smoothstep(t)) * baseAlpha);
        }, false);
        (entity.billboard as unknown as Record<string, unknown>).color = cb;
    }

    if (entity.point?.color) {
        const base = Color.clone((entity.point.color as ConstantProperty).getValue(jd) as Color ?? Color.WHITE);
        const baseAlpha = base.alpha;

        const cb = new CallbackProperty((time: JulianDate | undefined) => {
            const t = Math.min((time ? JulianDate.secondsDifference(time, jd) : 0) / durationS, 1);
            if (t < 1 && !viewer.isDestroyed()) viewer.scene.requestRender();
            return base.withAlpha((1 - smoothstep(t)) * baseAlpha);
        }, false);
        (entity.point as unknown as Record<string, unknown>).color = cb;
    }

    viewer.scene.requestRender();
    setTimeout(() => onComplete?.(), durationMs + 50);
}

/**
 * Scale-bounce for billboard: 0.5 → 1.15 → 1.0 (spring-effekt).
 * Brukes av NewsLayer for å gi ikoner en livlig inngang.
 */
export function bounceInEntity(entity: Entity, viewer: Viewer, durationMs = 450): void {
    if (!entity.billboard) return;
    const jd = startJd();
    const durationS = durationMs / 1000;

    const cb = new CallbackProperty((time: JulianDate | undefined) => {
        const t = Math.min((time ? JulianDate.secondsDifference(time, jd) : 0) / durationS, 1);
        if (t < 1 && !viewer.isDestroyed()) viewer.scene.requestRender();
        if (t < 0.7) {
            const p = t / 0.7;
            return 0.5 + smoothstep(p) * 0.65;   // 0.5 → 1.15
        }
        const p = (t - 0.7) / 0.3;
        return 1.15 - smoothstep(p) * 0.15;       // 1.15 → 1.0
    }, false);
    (entity.billboard as unknown as Record<string, unknown>).scale = cb;

    setTimeout(() => {
        if (!viewer.isDestroyed() && entity.billboard)
            (entity.billboard as unknown as Record<string, unknown>).scale = new ConstantProperty(1.0);
        if (!viewer.isDestroyed()) viewer.scene.requestRender();
    }, durationMs + 50);

    viewer.scene.requestRender();
}
