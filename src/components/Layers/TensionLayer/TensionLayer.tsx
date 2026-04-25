import { useEffect, useRef } from 'react';
import {
    GeoJsonDataSource,
    Color,
    ConstantProperty,
    ColorMaterialProperty,
    JulianDate,
    ArcType,
    type Entity,
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayerActions, useLayerVisibility } from '@/store/layerStore';
import { usePollingData } from '@/hooks/usePollingData';
import { fetchConflicts } from '@/services/acled';
import { computeTensionScores, tensionToFillAlpha, tensionToColor } from '@/services/tension';

const POLL_MS = 30 * 60 * 1000; // 30 min

export function TensionLayer() {
    const viewer = useViewer();
    const { setLayerLoading, setLayerCount, setLayerError } = useLayerActions();
    const visible = useLayerVisibility('tension');
    const dsRef = useRef<GeoJsonDataSource | null>(null);
    const nameToEntityRef = useRef<Map<string, Entity[]>>(new Map());
    const pulseRef = useRef(0);
    const highTensionEntitiesRef = useRef<Set<string>>(new Set());

    const { data: conflicts, loading, error } = usePollingData(
        fetchConflicts,
        POLL_MS,
        visible,
    );

    // Propagate loading/error to layer store
    useEffect(() => {
        setLayerLoading('tension', loading);
    }, [loading, setLayerLoading]);

    useEffect(() => {
        if (error) setLayerError('tension', String(error));
        else setLayerError('tension', null);
    }, [error, setLayerError]);

    // Load the GeoJSON once on mount
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        let cancelled = false;

        async function load() {
            try {
                const ds = await GeoJsonDataSource.load('/data/countries.geojson', {
                    fill: Color.TRANSPARENT,
                    stroke: Color.TRANSPARENT,
                    strokeWidth: 1,
                    clampToGround: false,
                    describe: () => undefined,
                });
                if (cancelled || viewer!.isDestroyed()) return;
                ds.show = visible;
                await viewer!.dataSources.add(ds);
                dsRef.current = ds;

                // Bygg navn → entiteter-map
                const map = new Map<string, Entity[]>();
                for (const entity of ds.entities.values) {
                    if (entity.polygon) {
                        // GeoJsonDataSource sets arcType=RHUMB by default; override to GEODESIC
                        // to avoid Cesium's computeRhumbLineSubdivision exploding on large
                        // country polygons (Canada/Russia 600-800 vertices each).
                        entity.polygon.arcType = new ConstantProperty(ArcType.GEODESIC);
                        entity.polygon.height = new ConstantProperty(0);
                    }
                    const name = entity.properties?.NAME?.getValue(JulianDate.now()) as string | undefined;
                    if (name) {
                        const arr = map.get(name) ?? [];
                        arr.push(entity);
                        map.set(name, arr);
                    }
                }
                nameToEntityRef.current = map;
                setLayerCount('tension', map.size);
            } catch (err) {
                if (!cancelled) setLayerError('tension', String(err));
            }
        }

        void load();
        return () => {
            cancelled = true;
            if (dsRef.current && !viewer.isDestroyed()) {
                viewer.dataSources.remove(dsRef.current, true);
            }
            dsRef.current = null;
            nameToEntityRef.current.clear();
            highTensionEntitiesRef.current.clear();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewer]);

    // Sync visibility
    useEffect(() => {
        if (dsRef.current) dsRef.current.show = visible;
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [visible, viewer]);

    // Apply tension scores to country polygons
    useEffect(() => {
        const ds = dsRef.current;
        if (!ds || !conflicts || conflicts.length === 0) return;

        const scores = computeTensionScores(conflicts);
        highTensionEntitiesRef.current.clear();

        for (const [country, entities] of nameToEntityRef.current) {
            const score = scores.get(country) ?? 0;
            const alpha = tensionToFillAlpha(score);
            const [r, g, b] = tensionToColor(score);
            const fillColor = Color.fromBytes(r, g, b, Math.round(alpha * 255));
            const outlineColor = score > 0.3
                ? Color.fromBytes(r, g, b, Math.round((score * 0.8 + 0.1) * 255))
                : Color.TRANSPARENT;
            const hasOutline = score > 0.3;

            for (const entity of entities) {
                if (!entity.polygon) continue;
                (entity.polygon.material as unknown) = new ColorMaterialProperty(new ConstantProperty(fillColor));
                (entity.polygon.outline as ConstantProperty | undefined) = new ConstantProperty(hasOutline) as ConstantProperty;
                (entity.polygon.outlineColor as ConstantProperty | undefined) = new ConstantProperty(outlineColor) as ConstantProperty;
                (entity.polygon.outlineWidth as ConstantProperty | undefined) = new ConstantProperty(score > 0.6 ? 2 : 1) as ConstantProperty;

                if (score > 0.5) highTensionEntitiesRef.current.add(entity.id);
            }
        }

        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [conflicts, viewer]);

    // Pulserende outline for høy-spennings-land
    useEffect(() => {
        if (!visible) return;
        const interval = setInterval(() => {
            const ds = dsRef.current;
            if (!ds || !viewer || viewer.isDestroyed()) return;
            if (highTensionEntitiesRef.current.size === 0) return;

            pulseRef.current += 1;
            const phase = Math.sin(pulseRef.current * 0.3) * 0.5 + 0.5; // 0..1

            for (const entityId of highTensionEntitiesRef.current) {
                const entity = ds.entities.getById(entityId);
                if (!entity?.polygon) continue;
                // Finn score fra eksisterende fill-farge for å bestemme base-farge
                const currentFill = (entity.polygon.material as ColorMaterialProperty | undefined)
                    ?.color?.getValue(JulianDate.now()) as Color | undefined;
                if (!currentFill) continue;

                const pulsedAlpha = 0.35 + phase * 0.55; // 0.35..0.9
                const outlineColor = new Color(currentFill.red, currentFill.green, currentFill.blue, pulsedAlpha);
                (entity.polygon.outlineColor as unknown) = new ConstantProperty(outlineColor);
            }
            viewer.scene.requestRender();
        }, 800);
        return () => clearInterval(interval);
    }, [visible, viewer]);

    return null;
}
