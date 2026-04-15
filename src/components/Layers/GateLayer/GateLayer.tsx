import { useEffect, useRef } from 'react';
import {
    Cartesian3,
    Color,
    ConstantProperty,
    CustomDataSource,
    Entity,
    PolylineGlowMaterialProperty,
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { useGates } from '@/context/GateContext';
import { useTimelineEvents } from '@/context/TimelineEventContext';
import type { Gate, LatLon } from '@/types/gate';
import { useGateDrawing } from './useGateDrawing';

const GATE_COLOR = Color.fromCssColorString('#4a9eff');

interface GateEntityRecord {
    id: string;
    verticesSig: string;
    entity: Entity;
}

function verticesToCartesian(vertices: LatLon[]): Cartesian3[] {
    return vertices.map((v) => Cartesian3.fromDegrees(v.lon, v.lat, 0));
}

function verticesSignature(vertices: LatLon[]): string {
    return vertices.map((v) => `${v.lat.toFixed(5)},${v.lon.toFixed(5)}`).join('|');
}

function crossingsInLast24h(
    gateId: string,
    events: ReturnType<typeof useTimelineEvents>['events'],
    now: number,
): number {
    const windowStart = now - 24 * 60 * 60 * 1000;
    let count = 0;
    for (const ev of events) {
        if (ev.kind !== 'gate-crossing') continue;
        if (ev.gateId !== gateId) continue;
        if (ev.timestamp < windowStart) continue;
        count += 1;
    }
    return count;
}

interface GateLayerProps {
    onRequestName?: (vertices: LatLon[]) => void;
}

export function GateLayer({ onRequestName }: GateLayerProps = {}) {
    const viewer = useViewer();
    const { isVisible, setLayerCount } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const {
        gates,
        draw,
        isDrawing,
        pushDrawVertex,
        popDrawVertex,
        cancelDrawing,
        finishDrawing,
    } = useGates();
    const { events } = useTimelineEvents();
    const visible = isVisible('gates');

    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const entitiesRef = useRef<Map<string, GateEntityRecord>>(new Map());
    const gatesRef = useRef<Gate[]>(gates);
    gatesRef.current = gates;
    const eventsRef = useRef(events);
    eventsRef.current = events;

    useGateDrawing({
        viewer,
        isDrawing,
        vertices: draw.active ? draw.vertices : [],
        pushVertex: pushDrawVertex,
        popVertex: popDrawVertex,
        onFinish: () => {
            const captured = finishDrawing();
            if (captured) onRequestName?.(captured);
        },
        onCancel: () => {
            cancelDrawing();
        },
    });

    // Popup builder.
    useEffect(() => {
        register('gates', (entity) => {
            const gate = gatesRef.current.find((g) => g.id === entity.id);
            if (!gate) return null;
            const count = crossingsInLast24h(gate.id, eventsRef.current, Date.now());
            return {
                title: gate.name,
                icon: '⛩',
                color: '#4a9eff',
                fields: [
                    { label: 'Kryssinger siste 24t', value: count },
                    { label: 'Punkter', value: gate.vertices.length },
                ],
                description: count === 0 ? 'Ingen aktivitet siste døgn.' : undefined,
            };
        });
        return () => unregister('gates');
    }, [register, unregister]);

    // Tooltip builder.
    useEffect(() => {
        tooltipRegister('gates', (entity) => {
            const gate = gatesRef.current.find((g) => g.id === entity.id);
            if (!gate) return null;
            const count = crossingsInLast24h(gate.id, eventsRef.current, Date.now());
            return {
                title: gate.name,
                subtitle: count > 0 ? `${count} kryssinger siste 24t` : 'Ingen aktivitet 24t',
                icon: '⛩',
                color: '#4a9eff',
            };
        });
        return () => tooltipUnregister('gates');
    }, [tooltipRegister, tooltipUnregister]);

    // Data source lifecycle.
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('gates');
        viewer.dataSources.add(ds);
        dataSourceRef.current = ds;
        const store = entitiesRef.current;
        return () => {
            if (!viewer.isDestroyed()) viewer.dataSources.remove(ds, true);
            dataSourceRef.current = null;
            store.clear();
        };
    }, [viewer]);

    // Sync entities on gate changes.
    useEffect(() => {
        const ds = dataSourceRef.current;
        if (!ds) return;

        const store = entitiesRef.current;
        const seen = new Set<string>();

        for (const gate of gates) {
            seen.add(gate.id);
            const sig = verticesSignature(gate.vertices);
            const existing = store.get(gate.id);
            const positions = verticesToCartesian(gate.vertices);

            if (existing) {
                existing.entity.show = gate.visible;
                if (existing.verticesSig !== sig && existing.entity.polyline?.positions) {
                    (existing.entity.polyline.positions as ConstantProperty).setValue(
                        positions,
                    );
                    existing.verticesSig = sig;
                }
                if (existing.entity.name !== gate.name) {
                    existing.entity.name = gate.name;
                }
            } else {
                const entity = new Entity({
                    id: gate.id,
                    name: gate.name,
                    show: gate.visible,
                    polyline: {
                        positions: new ConstantProperty(positions),
                        width: 3,
                        material: new PolylineGlowMaterialProperty({
                            glowPower: 0.3,
                            color: GATE_COLOR.withAlpha(0.9),
                        }),
                        clampToGround: false,
                    },
                });
                ds.entities.add(entity);
                store.set(gate.id, { id: gate.id, verticesSig: sig, entity });
            }
        }

        // Remove vanished gates.
        for (const [id, rec] of store) {
            if (!seen.has(id)) {
                ds.entities.remove(rec.entity);
                store.delete(id);
            }
        }

        setLayerCount('gates', gates.length);
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [gates, setLayerCount, viewer]);

    // Hide entire data source when layer toggled off.
    useEffect(() => {
        if (dataSourceRef.current) dataSourceRef.current.show = visible;
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [visible, viewer]);

    return null;
}
