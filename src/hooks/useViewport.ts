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
    // Zoom-relativ terskel: 10 % av viewport-spennet, med gulv på 0.05°.
    // En fast grense (tidligere 0.5°) ga fetch-storm ved global zoom (ethvert
    // lite drag flyttet kantene > 0.5° og trigget refetch i alle viewport-
    // drevne lag) og ~55 km panorering før refresh ved by-zoom (stale data).
    const tolLon = Math.max(Math.abs(b.east - b.west), 0.05) * 0.1;
    const tolLat = Math.max(Math.abs(b.north - b.south), 0.05) * 0.1;
    return (
        Math.abs(a.west - b.west) < tolLon &&
        Math.abs(a.south - b.south) < tolLat &&
        Math.abs(a.east - b.east) < tolLon &&
        Math.abs(a.north - b.north) < tolLat
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
