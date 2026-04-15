import type { Gate, LatLon } from '@/types/gate';
import type {
    EntityType,
    GateCrossingEvent,
} from '@/types/timeline-event';
import {
    crossingDirection,
    crossesAntimeridian,
    isNearPole,
    segmentsIntersect,
} from './geofence';

export interface EntityPosition {
    pos: LatLon;
    ts: number;
}

export interface DetectOptions {
    maxStalenessMs: number;
}

function isGateUsable(gate: Gate): boolean {
    if (!gate.visible) return false;
    if (gate.vertices.length < 2) return false;
    if (isNearPole(gate.vertices)) return false;
    if (crossesAntimeridian(gate.vertices)) return false;
    return true;
}

function makeEventId(
    gateId: string,
    entityId: string,
    segmentIndex: number,
    timestamp: number,
): string {
    return `${gateId}:${entityId}:${segmentIndex}:${timestamp}`;
}

export function detectEntityCrossings(
    entityId: string,
    entityType: EntityType,
    prevState: EntityPosition,
    currState: EntityPosition,
    gates: readonly Gate[],
    options: DetectOptions,
): GateCrossingEvent[] {
    const dt = currState.ts - prevState.ts;
    if (dt <= 0) return [];
    if (dt > options.maxStalenessMs) return [];

    const usable = gates.filter(isGateUsable);
    if (usable.length === 0) return [];

    const events: GateCrossingEvent[] = [];

    for (const gate of usable) {
        for (let i = 1; i < gate.vertices.length; i++) {
            const ga = gate.vertices[i - 1];
            const gb = gate.vertices[i];
            const hit = segmentsIntersect(prevState.pos, currState.pos, ga, gb);
            if (!hit || !hit.intersects) continue;

            const ts = Math.round(
                prevState.ts + hit.fractionA * (currState.ts - prevState.ts),
            );
            const direction = crossingDirection(
                prevState.pos,
                currState.pos,
                ga,
                gb,
            );

            events.push({
                kind: 'gate-crossing',
                id: makeEventId(gate.id, entityId, i - 1, ts),
                timestamp: ts,
                gateId: gate.id,
                entityId,
                entityType,
                segmentIndex: i - 1,
                direction,
                position: hit.point,
            });
        }
    }

    return events;
}

export function detectCrossings(
    prev: Map<string, EntityPosition>,
    curr: Map<string, EntityPosition>,
    gates: Gate[],
    entityType: EntityType,
    options: DetectOptions,
): GateCrossingEvent[] {
    const events: GateCrossingEvent[] = [];
    for (const [id, currState] of curr) {
        const prevState = prev.get(id);
        if (!prevState) continue;
        events.push(
            ...detectEntityCrossings(
                id,
                entityType,
                prevState,
                currState,
                gates,
                options,
            ),
        );
    }
    return events;
}
