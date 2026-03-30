import { useEffect, useRef, useState, useCallback } from 'react';
import { UrlTemplateImageryProvider, ImageryLayer } from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';
import { usePollingData } from '@/hooks/usePollingData';
import { fetchRadarTimestamps, radarTileUrl } from '@/services/rainviewer';
import { type RainViewerFrame } from '@/types/weatherRadar';

const POLL_MS = 5 * 60 * 1000; // 5 min — oppdater tilgjengelige frames
const ANIM_INTERVAL = 500; // ms per frame i animasjon

function formatRadarTime(unix: number): string {
    return new Date(unix * 1000).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
}

export function WeatherRadarLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerError, setLayerLastUpdated } = useLayers();
    const visible = isVisible('weatherRadar');
    const layerRef = useRef<ImageryLayer | null>(null);

    const { data: radarData, loading, error, lastUpdated } = usePollingData(fetchRadarTimestamps, POLL_MS, visible);

    const [currentIndex, setCurrentIndex] = useState(-1);
    const [isAnimating, setIsAnimating] = useState(false);
    const animRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Kombiner past + nowcast frames
    const allFrames: RainViewerFrame[] = radarData
        ? [...radarData.radar.past, ...radarData.radar.nowcast]
        : [];
    const pastCount = radarData?.radar.past.length ?? 0;

    useEffect(() => { setLayerError('weatherRadar', error); }, [error, setLayerError]);
    useEffect(() => { setLayerLastUpdated('weatherRadar', lastUpdated); }, [lastUpdated, setLayerLastUpdated]);
    useEffect(() => { setLayerLoading('weatherRadar', loading); }, [loading, setLayerLoading]);

    // Sett initial frame til siste historiske
    useEffect(() => {
        if (radarData && currentIndex === -1 && radarData.radar.past.length > 0) {
            setCurrentIndex(radarData.radar.past.length - 1);
        }
    }, [radarData, currentIndex]);

    // Oppdater imagery layer når frame endres
    useEffect(() => {
        if (!viewer || viewer.isDestroyed() || !radarData || !visible || currentIndex < 0) return;
        const frame = allFrames[currentIndex];
        if (!frame) return;

        const url = radarTileUrl(radarData.host, frame.path);

        // Fjern gammel layer
        if (layerRef.current && viewer.imageryLayers.contains(layerRef.current)) {
            viewer.imageryLayers.remove(layerRef.current, true);
        }

        const provider = new UrlTemplateImageryProvider({ url, credit: 'RainViewer' });
        const layer = viewer.imageryLayers.addImageryProvider(provider);
        layer.alpha = 0.6;
        layerRef.current = layer;

        viewer.scene.requestRender();
    }, [viewer, radarData, currentIndex, visible]);

    // Skjul/vis
    useEffect(() => {
        if (!layerRef.current) return;
        if (!visible) {
            if (viewer && !viewer.isDestroyed() && viewer.imageryLayers.contains(layerRef.current)) {
                viewer.imageryLayers.remove(layerRef.current, true);
                layerRef.current = null;
            }
            // Stopp animasjon
            if (animRef.current) {
                clearInterval(animRef.current);
                animRef.current = null;
                setIsAnimating(false);
            }
        }
    }, [visible, viewer]);

    // Cleanup
    useEffect(() => {
        return () => {
            if (animRef.current) clearInterval(animRef.current);
            if (viewer && !viewer.isDestroyed() && layerRef.current) {
                viewer.imageryLayers.remove(layerRef.current, true);
                layerRef.current = null;
            }
        };
    }, [viewer]);

    // Animasjonslogikk
    const toggleAnimation = useCallback(() => {
        if (isAnimating) {
            if (animRef.current) clearInterval(animRef.current);
            animRef.current = null;
            setIsAnimating(false);
        } else {
            animRef.current = setInterval(() => {
                setCurrentIndex((prev) => {
                    if (prev >= allFrames.length - 1) return 0;
                    return prev + 1;
                });
            }, ANIM_INTERVAL);
            setIsAnimating(true);
        }
    }, [isAnimating, allFrames.length]);

    // Rydd opp animasjon ved unmount
    useEffect(() => {
        return () => {
            if (animRef.current) clearInterval(animRef.current);
        };
    }, []);

    if (!visible || allFrames.length === 0) return null;

    const currentFrame = allFrames[currentIndex];
    const isNowcast = currentIndex >= pastCount;

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-10
                        flex items-center gap-3 px-4 py-2.5
                        bg-[var(--bg-ui)] backdrop-blur-md
                        border border-white/10 rounded-xl
                        text-sm select-none">
            {/* Play / Pause */}
            <button
                onClick={toggleAnimation}
                className="w-8 h-8 flex items-center justify-center
                           rounded-lg bg-white/5 hover:bg-white/10
                           text-[var(--color-weather-radar)] transition-colors"
                title={isAnimating ? 'Pause' : 'Spill av'}
            >
                {isAnimating ? '⏸' : '▶'}
            </button>

            {/* Slider */}
            <input
                type="range"
                min={0}
                max={allFrames.length - 1}
                value={currentIndex}
                onChange={(e) => {
                    setCurrentIndex(Number(e.target.value));
                    if (isAnimating) {
                        if (animRef.current) clearInterval(animRef.current);
                        animRef.current = null;
                        setIsAnimating(false);
                    }
                }}
                className="w-40 accent-[var(--color-weather-radar)]"
            />

            {/* Tidsstempel */}
            <span className="font-mono text-xs text-[var(--text-secondary)] min-w-[40px] text-center">
                {currentFrame ? formatRadarTime(currentFrame.time) : '--:--'}
            </span>

            {/* Prognose-markør */}
            <span className={`text-xs px-1.5 py-0.5 rounded ${
                isNowcast
                    ? 'bg-[var(--color-weather-radar)]/20 text-[var(--color-weather-radar)]'
                    : 'bg-white/5 text-[var(--text-muted)]'
            }`}>
                {isNowcast ? 'Prognose' : 'Historisk'}
            </span>

            {/* Siste-knapp */}
            <button
                onClick={() => {
                    setCurrentIndex(pastCount > 0 ? pastCount - 1 : 0);
                    if (isAnimating) {
                        if (animRef.current) clearInterval(animRef.current);
                        animRef.current = null;
                        setIsAnimating(false);
                    }
                }}
                className="text-xs px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10
                           text-[var(--text-secondary)] transition-colors"
                title="Gå til siste radar-bilde"
            >
                Siste
            </button>
        </div>
    );
}
