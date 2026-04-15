import { useEffect, useRef } from 'react';
import { UrlTemplateImageryProvider, ImageryLayer } from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';

// gpsjam.org — daglig heatmap av GPS-forstyrrelser globalt.
// Data fra ADS-B Exchange: fly som rapporterer GPS-konfidensfall avslører
// mulig jamming/spoofing i et område.
// Tiles oppdateres ~6 timer etter siste 24h-periode.
// URL-format: https://gpsjam.org/tiles/{z}/{x}/{y}?date=YYYY-MM-DD
function getYesterday(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
}

export function GPSJamLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerError } = useLayers();
    const visible = isVisible('gpsjam');
    const layerRef = useRef<ImageryLayer | null>(null);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed() || !visible) return;

        setLayerLoading('gpsjam', true);
        const date = getYesterday();
        const url = `https://gpsjam.org/tiles/{z}/{x}/{y}?date=${date}`;

        const provider = new UrlTemplateImageryProvider({
            url,
            credit: 'gpsjam.org / ADS-B Exchange',
            minimumLevel: 0,
            maximumLevel: 7,
        });

        const layer = viewer.imageryLayers.addImageryProvider(provider);
        layer.alpha = 0.65;
        layerRef.current = layer;

        // UrlTemplateImageryProvider har ikke en ferdig-event, så vi setter loading til false etter et kort delay
        const t = setTimeout(() => setLayerLoading('gpsjam', false), 1500);
        setLayerError('gpsjam', null);
        viewer.scene.requestRender();

        return () => {
            clearTimeout(t);
            if (viewer && !viewer.isDestroyed() && viewer.imageryLayers.contains(layer)) {
                viewer.imageryLayers.remove(layer, true);
            }
            layerRef.current = null;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewer, visible]);

    // Skjul ved toggle-off
    useEffect(() => {
        if (!layerRef.current) return;
        layerRef.current.show = visible;
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [visible, viewer]);

    return null;
}
