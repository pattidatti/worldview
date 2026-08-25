import { useImagery } from '@/context/ImageryContext';
import { IMAGERY_MODES } from '@/types/imagery';
import { isPhotorealConfigured } from '@/utils/photorealTileset';

const PHOTOREAL_SOURCE_LABEL: Record<string, string> = {
    google: 'Google Map Tiles API (egen nøkkel)',
    ion: 'Cesium Ion asset 2275207',
};

export function ImageryPicker() {
    const { activeMode, setMode, photoreal } = useImagery();

    const photorealConfigured = isPhotorealConfigured();
    const photorealBlocked = !photorealConfigured || !!photoreal.error;

    function describe(id: string, fallback: string): string {
        if (id !== 'photorealistic3d') return fallback;
        if (!photorealConfigured) {
            return 'Krever VITE_GOOGLE_MAPS_API_KEY eller VITE_CESIUM_ION_TOKEN';
        }
        if (photoreal.error) return `Utilgjengelig:\n${photoreal.error}`;
        if (photoreal.source) return `${fallback} — via ${PHOTOREAL_SOURCE_LABEL[photoreal.source]}`;
        return fallback;
    }

    return (
        <div>
            <div className="flex items-center gap-1 bg-[var(--bg-ui)] backdrop-blur-md border border-white/10 rounded-full px-1.5 py-1.5 shadow-2xl">
                {IMAGERY_MODES.map((mode) => {
                    const blocked = mode.id === 'photorealistic3d' && photorealBlocked;
                    return (
                        <button
                            key={mode.id}
                            onClick={() => setMode(mode.id)}
                            title={describe(mode.id, mode.description)}
                            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-sans transition-all duration-200 cursor-pointer
                                ${activeMode === mode.id
                                    ? 'bg-white/20 text-white shadow-inner'
                                    : blocked
                                        ? 'text-white/25 hover:text-white/40 hover:bg-white/5'
                                        : 'text-white/50 hover:text-white/80 hover:bg-white/8'
                                }`}
                        >
                            <span className="text-base leading-none">{mode.icon}</span>
                            <span className="text-xs tracking-wide">{mode.label}</span>
                            {blocked && (
                                <span
                                    aria-hidden
                                    className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[var(--color-traffic-red)]"
                                />
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
