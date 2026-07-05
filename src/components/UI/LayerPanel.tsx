import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
    useLayerActions,
    useLayerStatus,
    useLayerStore,
    useLayerVisibility,
} from '@/store/layerStore';
import { useGates } from '@/context/GateContext';
import {
    type LayerCategory,
    type LayerId,
    LAYER_ICONS,
    LAYER_CATEGORIES,
    LAYER_DEFAULTS,
} from '@/types/layers';
import { AnimatedCount } from './AnimatedCount';

const CATEGORY_STORAGE_KEY = 'worldview-category-open';

// Pulse duration in seconds, keyed to each layer's approximate polling interval
const LAYER_PULSE_DURATION: Partial<Record<LayerId, number>> = {
    flights: 1.0,
    ships: 1.2,
    simulatedTraffic: 1.3,
    earthquakes: 1.5,
    trafficFlow: 1.8,
    traffic: 2.0,
    roadCameras: 2.0,
    sigmet: 2.0,
    weatherRadar: 2.2,
    news: 2.5,
    weather: 2.8,
    webcams: 3.0,
    gpsjam: 3.0,
    conflicts: 3.2,
    disasters: 3.2,
    satellites: 3.5,
    asteroids: 4.0,
};

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

const LayerToggle = memo(function LayerToggle({ id }: { id: LayerId }) {
    const visible = useLayerVisibility(id);
    const status = useLayerStatus(id);
    const meta = useLayerStore((s) => s.meta[id]);
    const { toggleLayer } = useLayerActions();
    const { startDrawing, isDrawing } = useGates();
    const [pulsing, setPulsing] = useState(false);
    const prevCountRef = useRef(status.count);

    useEffect(() => {
        if (status.count !== prevCountRef.current && status.count > 0 && visible) {
            setPulsing(true);
            const t = setTimeout(() => setPulsing(false), 450);
            prevCountRef.current = status.count;
            return () => clearTimeout(t);
        }
        prevCountRef.current = status.count;
    }, [status.count, visible]);

    return (
        <button
            onClick={() => toggleLayer(id)}
            className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg transition-all duration-200 cursor-pointer
                ${visible ? 'bg-white/5' : 'bg-transparent opacity-[0.35]'}
                ${status.error ? 'animate-glitch-error border border-red-500/40' : 'border border-transparent'}
                hover:bg-white/10`}
        >
            <span className="text-sm w-5 text-center shrink-0">{LAYER_ICONS[id]}</span>
            <span
                className={`w-2 h-2 rounded-full shrink-0${visible && status.count > 0 && !pulsing ? ' live-pulse-dot' : ''}`}
                style={{
                    backgroundColor: visible ? meta.color : '#555',
                    boxShadow: pulsing && visible ? `0 0 7px 2px ${meta.color}` : 'none',
                    transform: pulsing ? 'scale(1.5)' : undefined,
                    transition: 'transform 0.15s ease-out, box-shadow 0.15s ease-out',
                    animationDuration: visible && status.count > 0 ? `${LAYER_PULSE_DURATION[id] ?? 1.8}s` : undefined,
                }}
            />
            <span className="font-sans text-xs text-[var(--text-secondary)] flex-1 text-left truncate">
                {meta.name}
            </span>
            {status.loading ? (
                <span className="text-xs text-[var(--text-muted)] animate-pulse shrink-0">...</span>
            ) : status.error ? (
                <span className="relative group shrink-0">
                    <span className="text-xs text-orange-400 cursor-default">⚠</span>
                    <span className="absolute right-full top-1/2 -translate-y-1/2 mr-2 w-max max-w-48 px-2 py-1 rounded bg-[#1a1a2e] border border-orange-400/30 text-[10px] text-orange-300 leading-snug opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-pre-wrap">
                        {status.error}
                    </span>
                </span>
            ) : status.count > 0 ? (
                <AnimatedCount
                    value={status.count}
                    color="var(--text-muted)"
                    flashColor={meta.color}
                    className="font-mono text-xs shrink-0"
                    title={status.lastUpdated ? `Sist oppdatert: ${formatTimeAgo(status.lastUpdated)}` : undefined}
                />
            ) : null}
            {id === 'gates' && visible && (
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
});

interface CategoryAggregate {
    activeCount: number;
    totalEntities: number;
    hasError: boolean;
}

function useCategoryAggregate(ids: readonly LayerId[]): CategoryAggregate {
    return useLayerStore(
        useShallow((s) => {
            let activeCount = 0;
            let totalEntities = 0;
            let hasError = false;
            for (const id of ids) {
                if (s.visibility[id]) {
                    activeCount++;
                    totalEntities += s.status[id].count;
                    if (s.status[id].error) hasError = true;
                }
            }
            return { activeCount, totalEntities, hasError };
        })
    );
}

const CategorySection = memo(function CategorySection({
    category,
    isOpen,
    onToggleOpen,
}: {
    category: LayerCategory;
    isOpen: boolean;
    onToggleOpen: () => void;
}) {
    const { activeCount, totalEntities, hasError } = useCategoryAggregate(category.layers);
    const hasActive = activeCount > 0;
    const { toggleCategory } = useLayerActions();

    return (
        <div style={{ borderLeft: `2px solid ${hasActive ? 'rgba(0, 212, 255, 0.3)' : 'transparent'}`, transition: 'border-color 0.3s' }}>
            <div className="flex items-center w-full hover:bg-white/5 transition-colors">
                <button
                    onClick={() => toggleCategory(category.layers)}
                    title={hasActive ? 'Skru av alle lag i kategorien' : 'Skru på alle lag i kategorien'}
                    className="flex items-center gap-2 flex-1 px-3 py-2 cursor-pointer text-left"
                >
                    <span className="text-base w-5 text-center shrink-0">{category.icon}</span>
                    <span
                        className="font-sans text-xs font-medium flex-1 transition-colors duration-200 min-w-0 truncate"
                        style={{ color: hasActive ? 'var(--text-primary, #fff)' : 'var(--text-muted)' }}
                    >
                        {category.label}
                    </span>
                    {hasActive && (
                        <span
                            className="font-mono text-[9px] shrink-0 tabular-nums"
                            style={{ color: 'rgba(255,255,255,0.35)' }}
                            title={`${activeCount} av ${category.layers.length} aktive · ${totalEntities.toLocaleString('nb-NO')} enheter`}
                        >
                            {activeCount}/{category.layers.length}
                            {totalEntities > 0 && ` · ${totalEntities.toLocaleString('nb-NO')}`}
                        </span>
                    )}
                    {hasError ? (
                        <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: 'var(--accent-orange, #ff6b35)' }}
                            title="Minst ett lag har feil"
                        />
                    ) : (
                        <span
                            className="w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-200"
                            style={{
                                backgroundColor: hasActive ? 'var(--accent-blue)' : 'transparent',
                                border: hasActive ? 'none' : '1px solid rgba(255,255,255,0.2)',
                            }}
                        />
                    )}
                </button>
                <button
                    onClick={onToggleOpen}
                    className="px-2 py-2 cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors shrink-0"
                >
                    <svg
                        width="10" height="10" viewBox="0 0 10 10"
                        fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                        className={`transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                    >
                        <path d="M3 2l4 3-4 3"/>
                    </svg>
                </button>
            </div>

            {isOpen && (
                <div className="pb-1 flex flex-col gap-0.5">
                    {category.layers.map((id) => (
                        <LayerToggle key={id} id={id} />
                    ))}
                </div>
            )}
        </div>
    );
});

function initialOpenCategories(): Set<string> {
    const saved = loadOpenCategories();
    if (saved.size > 0) return saved;
    // Smart default: åpne trafikk + maritim når ingen lagret preferanse finnes.
    return new Set(['trafikk', 'maritim']);
}

export function LayerPanel({ mobileOpen = false }: { mobileOpen?: boolean }) {
    const [openCategories, setOpenCategories] = useState<Set<string>>(() => initialOpenCategories());
    const [query, setQuery] = useState('');
    const searchRef = useRef<HTMLInputElement>(null);

    const toggleOpen = useCallback((catId: string) => {
        setOpenCategories((prev) => {
            const next = new Set(prev);
            if (next.has(catId)) next.delete(catId);
            else next.add(catId);
            saveOpenCategories(next);
            return next;
        });
    }, []);

    const filteredIds = useMemo<LayerId[] | null>(() => {
        const q = query.trim().toLowerCase();
        return q ? LAYER_DEFAULTS.filter((l) => l.name.toLowerCase().includes(q)).map((l) => l.id) : null;
    }, [query]);

    return (
        <div className={`absolute left-4 top-14 z-10 ${mobileOpen ? 'block' : 'hidden md:block'}`}>
            <div className="w-56 bg-[var(--bg-ui-solid)] border border-[var(--glass-border)] rounded-2xl overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 7rem)', boxShadow: 'var(--shadow-panel)' }}>
                <div className="px-3 pt-2 pb-1">
                    <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-full px-3 py-1.5">
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

                <div className="py-1 flex flex-col divide-y divide-white/5 overflow-y-auto flex-1 min-h-0">
                    {filteredIds ? (
                        filteredIds.length > 0 ? (
                            <div className="pb-1 flex flex-col gap-0.5 px-0">
                                {filteredIds.map((id) => (
                                    <LayerToggle key={id} id={id} />
                                ))}
                            </div>
                        ) : (
                            <p className="px-3 py-3 text-xs text-[var(--text-muted)] text-center">
                                Ingen treff
                            </p>
                        )
                    ) : (
                        LAYER_CATEGORIES.map((cat) => (
                            <CategorySection
                                key={cat.id}
                                category={cat}
                                isOpen={openCategories.has(cat.id)}
                                onToggleOpen={() => toggleOpen(cat.id)}
                            />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
