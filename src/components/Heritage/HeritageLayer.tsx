import { useEffect, useRef, useState } from 'react';
import { CustomDataSource } from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { HERITAGE_SITES } from '@/data/heritageSites';
import { buildPyramidEntities, buildSphinxEntities } from './monumentGeometry';
import { useHeritageProximity } from './useHeritageProximity';
import { HeritagePopup } from './HeritagePopup';
import { HeritageTour } from './HeritageTour';

/**
 * Verdens-arv-laget: alltid aktivt, ikke i lag-systemet.
 * Bygger 3D-pyramider, lyssøyler, fakta-billboards og målestokk for hvert monument.
 * Trigger 2D auto-popup ved nær zoom og spiller cinematic tour på forespørsel.
 */
export function HeritageLayer() {
    const viewer = useViewer();
    const dsRef = useRef<CustomDataSource | null>(null);
    const proximity = useHeritageProximity(viewer);
    const [tourActive, setTourActive] = useState(false);

    // Opprett dataSource og bygg all geometri én gang
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('heritage');
        viewer.dataSources.add(ds);
        dsRef.current = ds;

        for (const site of HERITAGE_SITES) {
            for (const m of site.monuments) {
                if (m.kind === 'sphinx') buildSphinxEntities(ds, m);
                else buildPyramidEntities(ds, m);
            }
        }
        viewer.scene.requestRender();

        return () => {
            if (!viewer.isDestroyed()) viewer.dataSources.remove(ds, true);
            dsRef.current = null;
        };
    }, [viewer]);

    return (
        <>
            {proximity.nearest && !tourActive && (
                <HeritagePopup
                    monument={proximity.nearest}
                    onStartTour={() => setTourActive(true)}
                />
            )}
            {tourActive && (
                <HeritageTour
                    onDone={() => setTourActive(false)}
                />
            )}
        </>
    );
}
