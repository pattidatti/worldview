import { type Entity, type Viewer, ConstantProperty, JulianDate, Color } from 'cesium';
import { renderScheduler } from '@/core/RenderScheduler';

function smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
}

// Delt animasjonsdriver: RenderScheduler kjører ALLE aktive fade/bounce-jobber på
// én 30fps-timer, uansett hvor mange entiteter som animerer samtidig. Uten denne
// ville en poll som legger til 2000 fly spawne 2000 uavhengige timere som hver
// kalte requestRender — nå blir det maks én requestRender per viewer per tick.
function animate(
    durationMs: number,
    viewer: Viewer,
    onTick: (t: number) => void,
    onDone?: () => void,
): void {
    renderScheduler.animate({ durationMs, onTick, onDone }, viewer);
}

/**
 * Fader inn billboard.color og/eller point.color fra alpha 0 → full alpha.
 * Alle fades deler én timer (se driver over). Kall ETTER at entity er lagt til DataSource.
 */
export function fadeInEntity(entity: Entity, viewer: Viewer, durationMs = 600): void {
    const jd = JulianDate.fromDate(new Date());
    let target: Color | null = null;
    let pointTarget: Color | null = null;
    let billboardProp: ConstantProperty | null = null;
    let pointProp: ConstantProperty | null = null;

    if (entity.billboard) {
        const existing = entity.billboard.color;
        target = existing
            ? Color.clone((existing as ConstantProperty).getValue(jd) as Color ?? Color.WHITE)
            : Color.WHITE.clone();
        billboardProp = new ConstantProperty(target.withAlpha(0));
        (entity.billboard as unknown as Record<string, unknown>).color = billboardProp;
    }
    if (entity.point?.color) {
        pointTarget = Color.clone((entity.point.color as ConstantProperty).getValue(jd) as Color ?? Color.WHITE);
        pointProp = new ConstantProperty(pointTarget.withAlpha(0));
        (entity.point as unknown as Record<string, unknown>).color = pointProp;
    }

    animate(
        durationMs,
        viewer,
        (t) => {
            const a = smoothstep(t);
            if (target && billboardProp) {
                billboardProp.setValue(target.withAlpha(a * target.alpha));
            }
            if (pointTarget && pointProp) {
                pointProp.setValue(pointTarget.withAlpha(a * pointTarget.alpha));
            }
        },
        () => {
            if (target && billboardProp) billboardProp.setValue(target);
            if (pointTarget && pointProp) pointProp.setValue(pointTarget);
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
    let billboardProp: ConstantProperty | null = null;
    let pointProp: ConstantProperty | null = null;

    if (entity.billboard) {
        const existing = entity.billboard.color;
        base = existing
            ? Color.clone((existing as ConstantProperty).getValue(jd) as Color ?? Color.WHITE)
            : Color.WHITE.clone();
        billboardProp = new ConstantProperty(base);
        (entity.billboard as unknown as Record<string, unknown>).color = billboardProp;
    }
    if (entity.point?.color) {
        pointBase = Color.clone((entity.point.color as ConstantProperty).getValue(jd) as Color ?? Color.WHITE);
        pointProp = new ConstantProperty(pointBase);
        (entity.point as unknown as Record<string, unknown>).color = pointProp;
    }

    animate(
        durationMs,
        viewer,
        (t) => {
            const a = 1 - smoothstep(t);
            if (base && billboardProp) {
                billboardProp.setValue(base.withAlpha(a * base.alpha));
            }
            if (pointBase && pointProp) {
                pointProp.setValue(pointBase.withAlpha(a * pointBase.alpha));
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

    const scaleProp = new ConstantProperty(0.5);
    (entity.billboard as unknown as Record<string, unknown>).scale = scaleProp;

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
            scaleProp.setValue(scale);
        },
        () => scaleProp.setValue(1.0),
    );
}
