import { useState, useEffect, useRef } from 'react';
import { useLayers } from '@/context/LayerContext';
import { type LayerConfig, type LayerCategory, LAYER_ICONS, LAYER_CATEGORIES } from '@/types/layers';
import { AnimatedCount } from './AnimatedCount';

function formatTimeAgo(ts: number): string {
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return 'Nå';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m siden`;
    return `${Math.floor(min / 60)}t siden`;
}

function LayerToggle({ layer }: { layer: LayerConfig }) {
    const { toggleLayer } = useLayers();
    const [pulsing, setPulsing] = useState(false);
    const prevCountRef = useRef(layer.count);

    useEffect(() => {
        if (layer.count !== prevCountRef.current && layer.count > 0 && layer.visible) {
            setPulsing(true);
            const t = setTimeout(() => setPulsing(false), 450);
            prevCountRef.current = layer.count;
            return () => clearTimeout(t);
        }
        prevCountRef.current = layer.count;
    }, [layer.count, layer.visible]);

    return (
        <button
            onClick={() => toggleLayer(layer.id)}
            className={`flex items-center gap-2 w-full px-3 py-1.5 rounded-lg transition-all duration-200 cursor-pointer
                ${layer.visible ? 'bg-white/5' : 'bg-transparent opacity-40'}
                hover:bg-white/10`}
        >
            <span className="text-sm w-5 text-center shrink-0">{LAYER_ICONS[layer.id]}</span>
            <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{
                    backgroundColor: layer.visible ? layer.color : '#555',
                    boxShadow: pulsing && layer.visible ? `0 0 7px 2px ${layer.color}` : 'none',
                    transform: pulsing ? 'scale(1.5)' : 'scale(1)',
                    transition: 'transform 0.15s ease-out, box-shadow 0.15s ease-out',
                }}
            />
            <span className="font-sans text-xs text-[var(--text-secondary)] flex-1 text-left truncate">
                {layer.name}
            </span>
            {layer.loading ? (
                <span className="text-xs text-[var(--text-muted)] animate-pulse shrink-0">...</span>
            ) : layer.error ? (
                <span className="text-xs text-orange-400 shrink-0" title={layer.error}>⚠</span>
            ) : layer.count > 0 ? (
                <AnimatedCount
                    value={layer.count}
                    color="var(--text-muted)"
                    flashColor={layer.color}
                    className="font-mono text-xs shrink-0"
                    title={layer.lastUpdated ? `Sist oppdatert: ${formatTimeAgo(layer.lastUpdated)}` : undefined}
                />
            ) : null}
        </button>
    );
}

function CategorySection({
    category,
    layers,
    isOpen,
    onToggle,
}: {
    category: LayerCategory;
    layers: LayerConfig[];
    isOpen: boolean;
    onToggle: () => void;
}) {
    const hasActive = layers.some((l) => l.visible);

    return (
        <div>
            <button
                onClick={onToggle}
                className="flex items-center gap-2 w-full px-3 py-2 cursor-pointer hover:bg-white/5 transition-colors"
            >
                <span className="text-base w-5 text-center shrink-0">{category.icon}</span>
                <span
                    className="font-sans text-xs font-medium flex-1 text-left transition-colors duration-200"
                    style={{ color: hasActive ? 'var(--text-primary, #fff)' : 'var(--text-muted)' }}
                >
                    {category.label}
                </span>
                <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                    {isOpen ? '▼' : '▶'}
                </span>
            </button>

            {isOpen && (
                <div className="pb-1 flex flex-col gap-0.5">
                    {layers.map((layer) => (
                        <LayerToggle key={layer.id} layer={layer} />
                    ))}
                </div>
            )}
        </div>
    );
}

export function LayerPanel() {
    const { layers } = useLayers();
    const [openCategory, setOpenCategory] = useState<string | null>(null);

    const layerById = Object.fromEntries(layers.map((l) => [l.id, l]));

    return (
        <div className="absolute left-4 top-20 z-10">
            <div className="w-40 bg-[var(--bg-ui)] backdrop-blur-md border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                <div className="py-1 flex flex-col divide-y divide-white/5">
                    {LAYER_CATEGORIES.map((cat) => {
                        const catLayers = cat.layers
                            .map((id) => layerById[id])
                            .filter(Boolean) as LayerConfig[];
                        return (
                            <CategorySection
                                key={cat.id}
                                category={cat}
                                layers={catLayers}
                                isOpen={openCategory === cat.id}
                                onToggle={() =>
                                    setOpenCategory(openCategory === cat.id ? null : cat.id)
                                }
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
