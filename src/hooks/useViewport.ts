import { useState, useEffect, useRef } from 'react';
import { Viewer, Math as CesiumMath, Rectangle } from 'cesium';

export interface Viewport {
    west: number;
    south: number;
    east: number;
    north: number;
}

export function useViewport(viewer: Viewer | null, debounceMs: number = 500): Viewport | null {
    const [viewport, setViewport] = useState<Viewport | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;

        const updateViewport = () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);

            timeoutRef.current = setTimeout(() => {
                if (viewer.isDestroyed()) return;

                const rect = viewer.camera.computeViewRectangle();
                if (!rect) return;

                setViewport({
                    west: CesiumMath.toDegrees(rect.west),
                    south: CesiumMath.toDegrees(rect.south),
                    east: CesiumMath.toDegrees(rect.east),
                    north: CesiumMath.toDegrees(rect.north),
                });
            }, debounceMs);
        };

        // Initial viewport
        updateViewport();

        const removeListener = viewer.camera.changed.addEventListener(updateViewport);

        // Lower the camera change threshold for more responsive updates
        viewer.camera.percentageChanged = 0.1;

        return () => {
            removeListener();
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [viewer, debounceMs]);

    return viewport;
}

export function viewportToRect(vp: Viewport): Rectangle {
    return Rectangle.fromDegrees(vp.west, vp.south, vp.east, vp.north);
}
