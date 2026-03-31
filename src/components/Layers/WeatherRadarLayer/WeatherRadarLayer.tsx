import { useEffect, useRef } from 'react';
import { UrlTemplateImageryProvider, ImageryLayer } from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';
import { usePollingData } from '@/hooks/usePollingData';
import { useWeatherRadar } from '@/context/WeatherRadarContext';
import { fetchRadarTimestamps, radarTileUrl } from '@/services/rainviewer';

const POLL_MS = 5 * 60 * 1000; // 5 min

export function WeatherRadarLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerError, setLayerLastUpdated } = useLayers();
    const visible = isVisible('weatherRadar');
    const layerRef = useRef<ImageryLayer | null>(null);

    const { setFrameData, currentIndex, stopAnimation } = useWeatherRadar();

    const { data: radarData, loading, error, lastUpdated } = usePollingData(
        fetchRadarTimestamps, POLL_MS, visible
    );

    useEffect(() => { setLayerError('weatherRadar', error); }, [error, setLayerError]);
    useEffect(() => { setLayerLastUpdated('weatherRadar', lastUpdated); }, [lastUpdated, setLayerLastUpdated]);
    useEffect(() => { setLayerLoading('weatherRadar', loading); }, [loading, setLayerLoading]);

    // Send frame-data inn i kontekst
    useEffect(() => {
        if (!radarData) return;
        const frames = [...radarData.radar.past, ...radarData.radar.nowcast];
        setFrameData(frames, radarData.radar.past.length);
    }, [radarData, setFrameData]);

    // Oppdater imagery layer når frame eller data endres
    useEffect(() => {
        if (!viewer || viewer.isDestroyed() || !radarData || !visible || currentIndex < 0) return;
        const allFrames = [...radarData.radar.past, ...radarData.radar.nowcast];
        const frame = allFrames[currentIndex];
        if (!frame) return;

        const url = radarTileUrl(radarData.host, frame.path);
        if (layerRef.current && viewer.imageryLayers.contains(layerRef.current)) {
            viewer.imageryLayers.remove(layerRef.current, true);
        }
        const provider = new UrlTemplateImageryProvider({ url, credit: 'RainViewer' });
        const layer = viewer.imageryLayers.addImageryProvider(provider);
        layer.alpha = 0.6;
        layerRef.current = layer;
        viewer.scene.requestRender();
    }, [viewer, radarData, currentIndex, visible]);

    // Skjul og stopp ved toggle-off
    useEffect(() => {
        if (!layerRef.current || visible) return;
        if (viewer && !viewer.isDestroyed() && viewer.imageryLayers.contains(layerRef.current)) {
            viewer.imageryLayers.remove(layerRef.current, true);
            layerRef.current = null;
        }
        stopAnimation();
    }, [visible, viewer, stopAnimation]);

    // Cleanup ved unmount
    useEffect(() => {
        return () => {
            stopAnimation();
            if (viewer && !viewer.isDestroyed() && layerRef.current) {
                viewer.imageryLayers.remove(layerRef.current, true);
                layerRef.current = null;
            }
        };
    }, [viewer, stopAnimation]);

    return null;
}
