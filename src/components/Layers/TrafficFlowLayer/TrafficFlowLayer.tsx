import { useEffect, useRef } from 'react';
import { UrlTemplateImageryProvider, ImageryLayer } from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';

const API_KEY = import.meta.env.VITE_TOMTOM_API_KEY || '';

// Skjul flytlaget over 300 km — veier er ikke synlige der uansett
const MAX_CAMERA_HEIGHT = 300_000;

export function TrafficFlowLayer() {
    const viewer = useViewer();
    const { isVisible } = useLayers();
    const visible = isVisible('trafficFlow');
    const layerRef = useRef<ImageryLayer | null>(null);

    // Opprett imagery-laget én gang når viewer er klar
    useEffect(() => {
        if (!viewer || viewer.isDestroyed() || !API_KEY) return;

        const provider = new UrlTemplateImageryProvider({
            url: `https://api.tomtom.com/traffic/map/4/tile/flow/relative/{z}/{x}/{y}.png?key=${API_KEY}`,
            credit: 'TomTom Traffic',
        });

        // Legg til øverst — tile-bakgrunnen er transparent, bare veier er farget
        const layer = viewer.imageryLayers.addImageryProvider(provider);
        layer.alpha = 0.8;
        layer.show = false;
        layerRef.current = layer;

        return () => {
            if (!viewer.isDestroyed()) viewer.imageryLayers.remove(layer, true);
            layerRef.current = null;
        };
    }, [viewer]);

    // Vis/skjul basert på toggle + kamerahøyde
    useEffect(() => {
        const layer = layerRef.current;
        if (!layer || !viewer) return;

        if (!visible) {
            layer.show = false;
            viewer.scene.requestRender();
            return;
        }

        const updateShow = () => {
            if (!layerRef.current || !viewer || viewer.isDestroyed()) return;
            const shouldShow = viewer.camera.positionCartographic.height < MAX_CAMERA_HEIGHT;
            if (layerRef.current.show !== shouldShow) {
                layerRef.current.show = shouldShow;
                viewer.scene.requestRender();
            }
        };

        updateShow();
        const removeListener = viewer.camera.changed.addEventListener(updateShow);
        return () => {
            removeListener();
            if (layerRef.current) layerRef.current.show = false;
        };
    }, [visible, viewer]);

    return null;
}
