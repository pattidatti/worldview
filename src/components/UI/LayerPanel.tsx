import { useState, useEffect, useRef } from 'react';
import { useLayers } from '@/context/LayerContext';
import { useGates } from '@/context/GateContext';
import { type LayerConfig, type LayerCategory, type LayerId, LAYER_ICONS, LAYER_CATEGORIES } from '@/types/layers';
import { AnimatedCount } from './AnimatedCount';

const CATEGORY_STORAGE_KEY = 'worldview-category-open';

function loadOpenCategories(): Set<string> {
    try {
        const raw = localStorage.getItem(CATEGORY_STORAGE_KEY);
        return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
        return new Set();
    }
}

function saveOpenCategories(open: Set<string>) {
    try {
        localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify([...open]));
    } catch { /* ignore */ }
}

function formatTimeAgo(ts: number): string {
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return 'Nå';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m siden`;
    return `${Math.floor(min / 60)}t siden`;
}

function LayerToggle({ layer }: { layer: LayerConfig }) {
    const { toggleLayer } = useLayers();
    const { startDrawing, isDrawing } = useGates();
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
                <span className="relative group shrink-0">
                    <span className="text-xs text-orange-400 cursor-default">⚠</span>
                    <span className="absolute right-full top-1/2 -translate-y-1/2 mr-2 w-max max-w-48 px-2 py-1 rounded bg-[#1a1a2e] border border-orange-400/30 text-[10px] text-orange-300 leading-snug opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-pre-wrap">
                        {layer.error}
                    </span>
                </span>
            ) : layer.count > 0 ? (
                <AnimatedCount
                    value={layer.count}
                    color="var(--text-muted)"
                    flashColor={layer.color}
                    className="font-mono text-xs shrink-0"
                    title={layer.lastUpdated ? `Sist oppdatert: ${formatTimeAgo(layer.lastUpdated)}` : undefined}
                />
            ) : null}
            {layer.id === 'gates' && layer.visible && (
                <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (!isDrawing) startDrawing();
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!isDrawing) startDrawing();
                        }
                    }}
                    title="Tegn ny port (G)"
                    className={`ml-1 text-[10px] font-mono px-1.5 py-0.5 rounded border cursor-pointer shrink-0 transition-colors
                        ${isDrawing
                            ? 'border-[var(--color-gates)] text-[var(--color-gates)] opacity-50 cursor-wait'
                            : 'border-white/20 text-[var(--color-gates)] hover:bg-white/10'}`}
                >
                    +port
                </span>
            )}
        </button>
    );
}

function CategorySection({
    category,
    layers,
    isOpen,
    onToggleOpen,
    onToggleAll,
}: {
    category: LayerCategory;
    layers: LayerConfig[];
    isOpen: boolean;
    onToggleOpen: () => void;
    onToggleAll: () => void;
}) {
    const hasActive = layers.some((l) => l.visible);

    return (
        <div>
            <div className="flex items-center w-full hover:bg-white/5 transition-colors">
                {/* Left: toggle all layers in category */}
                <button
                    onClick={onToggleAll}
                    title={hasActive ? 'Skru av alle lag i kategorien' : 'Skru på alle lag i kategorien'}
                    className="flex items-center gap-2 flex-1 px-3 py-2 cursor-pointer text-left"
                >
                    <span className="text-base w-5 text-center shrink-0">{category.icon}</span>
                    <span
                        className="font-sans text-xs font-medium flex-1 transition-colors duration-200"
                        style={{ color: hasActive ? 'var(--text-primary, #fff)' : 'var(--text-muted)' }}
                    >
                        {category.label}
                    </span>
                    <span
                        className="w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-200"
                        style={{
                            backgroundColor: hasActive ? 'var(--accent-blue)' : 'transparent',
                            border: hasActive ? 'none' : '1px solid rgba(255,255,255,0.2)',
                        }}
                    />
                </button>
                {/* Right: collapse/expand */}
                <button
                    onClick={onToggleOpen}
                    className="px-2 py-2 cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors shrink-0"
                >
                    <span className="text-[10px]">{isOpen ? '▼' : '▶'}</span>
                </button>
            </div>

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
    const { layers, toggleCategory } = useLayers();
    const [openCategories, setOpenCategories] = useState<Set<string>>(() => loadOpenCategories());
    const [query, setQuery] = useState('');
    const searchRef = useRef<HTMLInputElement>(null);

    const layerById = Object.fromEntries(layers.map((l) => [l.id, l]));

    function toggleOpen(catId: string) {
        setOpenCategories((prev) => {
            const next = new Set(prev);
            if (next.has(catId)) next.delete(catId);
            else next.add(catId);
            saveOpenCategories(next);
            return next;
        });
    }

    const filteredLayers = query.trim()
        ? layers.filter((l) => l.name.toLowerCase().includes(query.toLowerCase()))
        : null;

    return (
        <div className="absolute left-4 top-20 z-10">
            <div className="w-44 bg-[var(--bg-ui)] backdrop-blur-md border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                {/* Search */}
                <div className="px-3 pt-2 pb-1">
                    <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1">
                        <span className="text-[10px] text-[var(--text-muted)]">⌕</span>
                        <input
                            ref={searchRef}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Søk lag..."
                            className="flex-1 bg-transparent text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none min-w-0"
                            style={{ fontFamily: 'var(--font-sans)' }}
                        />
                        {query && (
                            <button
                                onClick={() => setQuery('')}
                                className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                            >
                                ×
                            </button>
                        )}
                    </div>
                </div>

                <div className="py-1 flex flex-col divide-y divide-white/5">
                    {filteredLayers ? (
                        /* Search results: flat list */
                        filteredLayers.length > 0 ? (
                            <div className="pb-1 flex flex-col gap-0.5 px-0">
                                {filteredLayers.map((layer) => (
                                    <LayerToggle key={layer.id} layer={layer} />
                                ))}
                            </div>
                        ) : (
                            <p className="px-3 py-3 text-xs text-[var(--text-muted)] text-center">
                                Ingen treff
                            </p>
                        )
                    ) : (
                        /* Normal category view */
                        LAYER_CATEGORIES.map((cat) => {
                            const catLayers = cat.layers
                                .map((id) => layerById[id as LayerId])
                                .filter(Boolean) as LayerConfig[];
                            return (
                                <CategorySection
                                    key={cat.id}
                                    category={cat}
                                    layers={catLayers}
                                    isOpen={openCategories.has(cat.id)}
                                    onToggleOpen={() => toggleOpen(cat.id)}
                                    onToggleAll={() => toggleCategory(cat.layers as LayerId[])}
                                />
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
