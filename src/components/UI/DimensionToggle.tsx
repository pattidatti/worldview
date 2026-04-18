import { useSceneProjection } from '@/context/SceneProjectionContext';

export function DimensionToggle() {
    const { is2D, setIs2D } = useSceneProjection();

    return (
        <div className="flex items-center gap-1 bg-[var(--bg-ui)] backdrop-blur-md border border-white/10 rounded-full px-1.5 py-1.5 shadow-2xl">
            <button
                onClick={() => setIs2D(false)}
                title="3D globusvisning"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-sans transition-all duration-200 cursor-pointer
                    ${!is2D
                        ? 'bg-white/20 text-white shadow-inner'
                        : 'text-white/50 hover:text-white/80 hover:bg-white/8'
                    }`}
            >
                <span className="text-base leading-none">🌐</span>
                <span className="text-xs tracking-wide">3D</span>
            </button>
            <button
                onClick={() => setIs2D(true)}
                title="2D kartvisning (CartoDB)"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-sans transition-all duration-200 cursor-pointer
                    ${is2D
                        ? 'bg-white/20 text-white shadow-inner'
                        : 'text-white/50 hover:text-white/80 hover:bg-white/8'
                    }`}
            >
                <span className="text-base leading-none">🗺</span>
                <span className="text-xs tracking-wide">2D</span>
            </button>
        </div>
    );
}
