import { useLayers } from '@/context/LayerContext';
import { useWeatherRadar } from '@/context/WeatherRadarContext';

function formatRadarTime(unix: number): string {
    return new Date(unix * 1000).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
}

export function WeatherRadarControls() {
    const { isVisible } = useLayers();
    const visible = isVisible('weatherRadar');
    const {
        allFrames, pastCount,
        currentIndex, setCurrentIndex,
        isAnimating, toggleAnimation, stopAnimation,
    } = useWeatherRadar();

    if (!visible || allFrames.length === 0) return null;

    const currentFrame = allFrames[currentIndex];
    const isNowcast = currentIndex >= pastCount;

    return (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-10
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
                value={currentIndex < 0 ? 0 : currentIndex}
                onChange={(e) => {
                    if (isAnimating) stopAnimation();
                    setCurrentIndex(Number(e.target.value));
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
                    if (isAnimating) stopAnimation();
                    setCurrentIndex(pastCount > 0 ? pastCount - 1 : 0);
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
