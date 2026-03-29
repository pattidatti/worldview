import { useState, useEffect, useRef, useCallback } from 'react';
import { Viewer, Math as CesiumMath, Rectangle } from 'cesium';

export interface Viewport {
    west: number;
    south: number;
    east: number;
    north: number;
}

function viewportsEqual(a: Viewport | null, b: Viewport): boolean {
    if (!a) return false;
    return (
        Math.abs(a.west - b.west) < 0.5 &&
        Math.abs(a.south - b.south) < 0.5 &&
        Math.abs(a.east - b.east) < 0.5 &&
        Math.abs(a.north - b.north) < 0.5
    );
}

export function useViewport(viewer: Viewer | null, debounceMs: number = 1000): Viewport | null {
    const [viewport, setViewport] = useState<Viewport | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const viewportRef = useRef<Viewport | null>(null);

    const computeViewport = useCallback(() => {
        if (!viewer || viewer.isDestroyed()) return;

        const rect = viewer.camera.computeViewRectangle();
        if (!rect) return;

        const next: Viewport = {
            west: CesiumMath.toDegrees(rect.west),
            south: CesiumMath.toDegrees(rect.south),
            east: CesiumMath.toDegrees(rect.east),
            north: CesiumMath.toDegrees(rect.north),
        };

        // Only update state if viewport actually changed significantly
        if (!viewportsEqual(viewportRef.current, next)) {
            viewportRef.current = next;
            setViewport(next);
        }
    }, [viewer]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;

        const onCameraChange = () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(computeViewport, debounceMs);
        };

        // Initial
        computeViewport();

        viewer.camera.percentageChanged = 0.2;
        const removeListener = viewer.camera.changed.addEventListener(onCameraChange);

        return () => {
            removeListener();
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [viewer, debounceMs, computeViewport]);

    return viewport;
}

export function viewportToRect(vp: Viewport): Rectangle {
    return Rectangle.fromDegrees(vp.west, vp.south, vp.east, vp.north);
}
