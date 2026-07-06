// Skjermposisjon for primitive-baserte entiteter (renderplan-lag som
// FlightRenderer) som ikke finnes i Cesium sitt Entity/DataSource-tre.
// Speiler useEntityScreenPos, men henter world-posisjonen fra
// trackingProviders (id = entitets-id uten kanal-prefiks, f.eks. icao24)
// i stedet for entity.position.getValue().
//
// Kritisk: kaller ALDRI requestRender — leser kun i preRender og setState
// ved ≥0.5px endring. Dermed bevares idle = 0 rendrede frames.

import { useState, useEffect, useRef } from 'react';
import { Viewer, SceneTransforms, Cartesian2 } from 'cesium';
import { trackingProviders } from '@/core/trackingProviders';

export function usePrimitiveScreenPos(
    viewer: Viewer | null,
    id: string | null,
): { x: number; y: number } | null {
    const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
    const posRef = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed() || !id) {
            setPos(null);
            posRef.current = null;
            return;
        }

        const scratch = new Cartesian2();

        const unsubscribe = viewer.scene.preRender.addEventListener(() => {
            if (viewer.isDestroyed()) return;
            const worldPos = trackingProviders.getPosition(id);
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
    }, [viewer, id]);

    return pos;
}
