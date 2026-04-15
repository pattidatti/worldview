import { useImagery } from '@/context/ImageryContext';
import { IMAGERY_MODES } from '@/types/imagery';

export function ImageryPicker() {
    const { activeMode, setMode } = useImagery();

    return (
        <div className="absolute bottom-28 right-6 z-10">
            <div className="flex items-center gap-1 bg-[var(--bg-ui)] backdrop-blur-md border border-white/10 rounded-full px-1.5 py-1.5 shadow-2xl">
                {IMAGERY_MODES.map((mode) => (
                    <button
                        key={mode.id}
                        onClick={() => setMode(mode.id)}
                        title={mode.description}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-sans transition-all duration-200 cursor-pointer
                            ${activeMode === mode.id
                                ? 'bg-white/20 text-white shadow-inner'
                                : 'text-white/50 hover:text-white/80 hover:bg-white/8'
                            }`}
                    >
                        <span className="text-base leading-none">{mode.icon}</span>
                        <span className="text-xs tracking-wide">{mode.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
