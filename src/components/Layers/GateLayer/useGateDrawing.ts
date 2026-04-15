import { useEffect, useRef } from 'react';
import {
    Cartesian2,
    Cartesian3,
    Cartographic,
    CallbackProperty,
    Color,
    CustomDataSource,
    Entity,
    Math as CesiumMath,
    PolylineGlowMaterialProperty,
    ScreenSpaceEventHandler,
    ScreenSpaceEventType,
    Viewer,
} from 'cesium';
import type { LatLon } from '@/types/gate';

const DRAW_COLOR = Color.fromCssColorString('#4a9eff');

export interface UseGateDrawingArgs {
    viewer: Viewer | null;
    isDrawing: boolean;
    vertices: LatLon[];
    pushVertex: (vertex: LatLon) => void;
    popVertex: () => void;
    onFinish: () => void;
    onCancel: () => void;
}

function pickLatLon(viewer: Viewer, x: number, y: number): LatLon | null {
    const ray = viewer.camera.getPickRay(new Cartesian2(x, y));
    if (!ray) return null;
    const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
    if (!cartesian) return null;
    const carto = Cartographic.fromCartesian(cartesian);
    return {
        lat: CesiumMath.toDegrees(carto.latitude),
        lon: CesiumMath.toDegrees(carto.longitude),
    };
}

export function useGateDrawing({
    viewer,
    isDrawing,
    vertices,
    pushVertex,
    popVertex,
    onFinish,
    onCancel,
}: UseGateDrawingArgs) {
    const verticesRef = useRef<LatLon[]>(vertices);
    verticesRef.current = vertices;
    const previewPosRef = useRef<LatLon | null>(null);

    // Preview data source: only mounted during draw mode.
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        if (!isDrawing) return;

        const ds = new CustomDataSource('gates-draw-preview');
        viewer.dataSources.add(ds);

        const positionsCallback = new CallbackProperty(() => {
            const committed = verticesRef.current;
            const preview = previewPosRef.current;
            const all = preview ? [...committed, preview] : committed;
            return all.map((v) => Cartesian3.fromDegrees(v.lon, v.lat, 0));
        }, false);

        ds.entities.add(
            new Entity({
                id: 'gate-draw-line',
                polyline: {
                    positions: positionsCallback,
                    width: 3,
                    material: new PolylineGlowMaterialProperty({
                        glowPower: 0.35,
                        color: DRAW_COLOR.withAlpha(0.9),
                    }),
                    clampToGround: false,
                },
            }),
        );

        viewer.canvas.style.cursor = 'crosshair';
        const renderLoop = setInterval(() => {
            if (!viewer.isDestroyed()) viewer.scene.requestRender();
        }, 60);

        return () => {
            clearInterval(renderLoop);
            if (!viewer.isDestroyed()) {
                viewer.dataSources.remove(ds, true);
                viewer.canvas.style.cursor = 'default';
            }
            previewPosRef.current = null;
        };
    }, [viewer, isDrawing]);

    // Input handlers: attach only during draw mode.
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        if (!isDrawing) return;

        const handler = new ScreenSpaceEventHandler(viewer.canvas);

        handler.setInputAction(
            (movement: { position: { x: number; y: number } }) => {
                const p = pickLatLon(viewer, movement.position.x, movement.position.y);
                if (p) pushVertex(p);
            },
            ScreenSpaceEventType.LEFT_CLICK,
        );

        handler.setInputAction(
            (movement: { endPosition: { x: number; y: number } }) => {
                const p = pickLatLon(
                    viewer,
                    movement.endPosition.x,
                    movement.endPosition.y,
                );
                previewPosRef.current = p;
            },
            ScreenSpaceEventType.MOUSE_MOVE,
        );

        handler.setInputAction(() => {
            onFinish();
        }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

        const keyHandler = (e: KeyboardEvent) => {
            // Ikke blokker tastetrykk når brukeren skriver i et input/textarea.
            const target = e.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                onFinish();
            } else if (e.key === 'Backspace') {
                e.preventDefault();
                if (verticesRef.current.length > 0) popVertex();
            }
        };
        window.addEventListener('keydown', keyHandler);

        return () => {
            window.removeEventListener('keydown', keyHandler);
            if (!handler.isDestroyed()) handler.destroy();
        };
    }, [viewer, isDrawing, pushVertex, popVertex, onFinish, onCancel]);
}
