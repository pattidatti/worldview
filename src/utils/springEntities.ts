import { type Entity, type Viewer, type PositionProperty, Cartesian3, CallbackProperty, ConstantPositionProperty } from 'cesium';

interface SpringState {
    pos: Cartesian3;
    vel: Cartesian3;
    target: Cartesian3;
    lastMs: number;
    settled: boolean;
}

// WeakMap holder state per entity — ingen kobling til Entity.properties
const springMap = new WeakMap<Entity, SpringState>();

export function springInEntity(
    entity: Entity,
    clusterCenter: Cartesian3,
    realTarget: Cartesian3,
    viewer: Viewer,
    springK = 0.16,
    damping = 0.52,
): void {
    if (!entity.position) return;

    const state: SpringState = {
        pos: Cartesian3.clone(clusterCenter),
        vel: new Cartesian3(),
        target: Cartesian3.clone(realTarget),
        lastMs: Date.now(),
        settled: false,
    };
    springMap.set(entity, state);

    const scratch = new Cartesian3();
    const diff    = new Cartesian3();

    // CallbackProperty implementerer Property men ikke PositionProperty i Cesiums TS-typer
    // — caster for å sette entity.position. Fungerer korrekt i Cesium runtime.
    entity.position = new CallbackProperty(() => {
        const s = springMap.get(entity);
        if (!s || s.settled) return s ? s.target : realTarget;

        const now = Date.now();
        const dt  = Math.min((now - s.lastMs) / 1000, 0.033);
        s.lastMs  = now;

        // vel += (target - pos) * springK
        Cartesian3.subtract(s.target, s.pos, diff);
        Cartesian3.multiplyByScalar(diff, springK, scratch);
        Cartesian3.add(s.vel, scratch, s.vel);

        // vel *= (1 - damping * dt) — eksponentiell demping
        Cartesian3.multiplyByScalar(s.vel, Math.max(0, 1 - damping * dt * 60), s.vel);

        // pos += vel * dt
        Cartesian3.multiplyByScalar(s.vel, dt, scratch);
        Cartesian3.add(s.pos, scratch, s.pos);

        // Settle når nær nok og treg nok
        if (Cartesian3.magnitude(diff) < 800 && Cartesian3.magnitude(s.vel) < 80) {
            entity.position = new ConstantPositionProperty(s.target);
            s.settled = true;
            if (!viewer.isDestroyed()) viewer.scene.requestRender();
            return s.target;
        }

        if (!viewer.isDestroyed()) viewer.scene.requestRender();
        return Cartesian3.clone(s.pos);
    }, false) as unknown as PositionProperty;
}

export function isSpringAnimating(entity: Entity): boolean {
    const s = springMap.get(entity);
    return s != null && !s.settled;
}
