// Scene-anvendelse (Fase E): sett lagkombinasjon, fly kamera til start, sett
// signatur-shader. Åpningsscenen kjøres én gang ved aller første besøk.

import { useCallback, useEffect, useRef } from 'react';
import { Cartesian3 } from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayerActions } from '@/store/layerStore';
import { useShaderOverlay } from '@/context/ShaderOverlayContext';
import { SCENES, OPENING_SCENE_ID, type Scene } from '@/types/scenes';

const LAYER_STORAGE_KEY = 'worldview-layer-visibility';
const OPENING_SEEN_KEY = 'worldview-opening-scene-seen';

export function useApplyScene(): (scene: Scene, fly?: boolean) => void {
    const viewer = useViewer();
    const { setVisibleLayers } = useLayerActions();
    const { setOverlay } = useShaderOverlay();

    return useCallback((scene: Scene, fly = true) => {
        setVisibleLayers(scene.layers);
        setOverlay(scene.shader ?? 'none');
        if (fly && viewer && !viewer.isDestroyed()) {
            viewer.camera.flyTo({
                destination: Cartesian3.fromDegrees(scene.camera.lon, scene.camera.lat, scene.camera.height),
                duration: 2.2,
            });
        }
    }, [viewer, setVisibleLayers, setOverlay]);
}

/**
 * Åpningsscene: ved aller første besøk (ingen lagret synlighet OG scenen ikke
 * vist før) anvendes en kuratert scene så appen åpner med et meningsfullt bilde
 * i stedet for et tomt kart. Returvisitter røres ikke.
 */
export function useOpeningScene(): void {
    const viewer = useViewer();
    const applyScene = useApplyScene();
    const doneRef = useRef(false);

    useEffect(() => {
        if (doneRef.current || !viewer || viewer.isDestroyed()) return;
        let firstVisit = false;
        try {
            firstVisit = localStorage.getItem(LAYER_STORAGE_KEY) === null
                && localStorage.getItem(OPENING_SEEN_KEY) === null;
        } catch { /* localStorage utilgjengelig — hopp over */ }
        if (!firstVisit) { doneRef.current = true; return; }
        const scene = SCENES.find((s) => s.id === OPENING_SCENE_ID);
        if (!scene) { doneRef.current = true; return; }
        doneRef.current = true;
        try { localStorage.setItem(OPENING_SEEN_KEY, '1'); } catch { /* ignore */ }
        applyScene(scene);
    }, [viewer, applyScene]);
}
