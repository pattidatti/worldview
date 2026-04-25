import { useState, useEffect, useRef } from 'react';
import { Viewer, Entity, JulianDate, SceneTransforms, Cartesian2 } from 'cesium';

export function useEntityScreenPos(
    viewer: Viewer | null,
    entity: Entity | null,
): { x: number; y: number } | null {
    const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
    const posRef = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed() || !entity) {
            setPos(null);
            posRef.current = null;
            return;
        }

        const scratch = new Cartesian2();

        const unsubscribe = viewer.scene.preRender.addEventListener(() => {
            if (viewer.isDestroyed()) return;
            const worldPos = entity.position?.getValue(JulianDate.now());
            if (!worldPos) {
                if (posRef.current !== null) {
                    posRef.current = null;
                    setPos(null);
                }
                return;
            }
            const win = SceneTransforms.worldToWindowCoordinates(viewer.scene, worldPos, scratch);
            if (!win) {
                if (posRef.current !== null) {
                    posRef.current = null;
                    setPos(null);
                }
                return;
            }
            const prev = posRef.current;
            if (
                prev === null ||
                Math.abs(prev.x - win.x) >= 0.5 ||
                Math.abs(prev.y - win.y) >= 0.5
            ) {
                const next = { x: win.x, y: win.y };
                posRef.current = next;
                setPos(next);
            }
        });

        return () => {
            unsubscribe();
            setPos(null);
            posRef.current = null;
        };
    }, [viewer, entity]);

    return pos;
}
