import { useEffect, useState } from 'react';
import { Cartesian3, Cartographic, type Viewer } from 'cesium';
import { HERITAGE_SITES } from '@/data/heritageSites';
import type { HeritageMonument } from '@/types/heritage';

export interface ProximityState {
    /** Nærmeste monument hvis kameraet er innenfor `popupRangeM`, ellers null. */
    nearest: HeritageMonument | null;
    /** Avstand i meter til nærmeste monument (uavhengig av terskel). */
    distanceM: number;
}

const POPUP_RANGE_M = 50_000; // 50 km — auto-popup terskel

/**
 * Sporer kamera-posisjon og finner nærmeste verdens-arv-monument.
 * Bruker Cesium sin `camera.changed`-event (lavfrekvent, kun når kameraet faktisk har flyttet seg).
 */
export function useHeritageProximity(viewer: Viewer | null): ProximityState {
    const [state, setState] = useState<ProximityState>({ nearest: null, distanceM: Infinity });

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const cam = viewer.camera;

        // Pre-compute monument-posisjoner i Cartesian3 én gang
        const monuments: { m: HeritageMonument; pos: Cartesian3 }[] = [];
        for (const site of HERITAGE_SITES) {
            for (const m of site.monuments) {
                monuments.push({
                    m,
                    pos: Cartesian3.fromDegrees(
                        m.center.lon,
                        m.center.lat,
                        m.groundElevationM + m.heightM / 2
                    ),
                });
            }
        }

        const compute = () => {
            const camPos = cam.positionWC;
            let bestM: HeritageMonument | null = null;
            let bestDist = Infinity;
            for (const { m, pos } of monuments) {
                const d = Cartesian3.distance(camPos, pos);
                if (d < bestDist) {
                    bestDist = d;
                    bestM = m;
                }
            }
            // For å unngå at popup'en hopper når man flyr over hele verden,
            // krever vi også at kameraets ellipsoide-høyde er rimelig lav.
            const carto = Cartographic.fromCartesian(camPos);
            const camAlt = carto?.height ?? Infinity;
            const inRange = bestDist < POPUP_RANGE_M && camAlt < POPUP_RANGE_M;

            setState((prev) => {
                const newNearest = inRange ? bestM : null;
                if (prev.nearest?.id === newNearest?.id && Math.abs(prev.distanceM - bestDist) < 50) {
                    return prev;
                }
                return { nearest: newNearest, distanceM: bestDist };
            });
        };

        const prev = cam.percentageChanged;
        cam.percentageChanged = 0.15;
        const remove = cam.changed.addEventListener(compute);
        compute();

        return () => {
            remove();
            cam.percentageChanged = prev;
        };
    }, [viewer]);

    return state;
}
