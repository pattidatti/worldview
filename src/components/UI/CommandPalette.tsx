import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Cartesian3, JulianDate } from 'cesium';
import { useShallow } from 'zustand/react/shallow';
import { useViewer } from '@/context/ViewerContext';
import { useLayerStore, useLayerActions, useVisibleLayerIds } from '@/store/layerStore';
import { geocode, type GeoResult } from '@/services/geocoding';
import { LAYER_DEFAULTS, LAYER_ICONS, type LayerId } from '@/types/layers';

interface LayerItem {
    kind: 'layer';
    id: LayerId;
    name: string;
    icon: string;
    visible: boolean;
    count: number;
    color: string;
}

interface EntityItem {
    kind: 'entity';
    entityId: string;
    name: string;
    icon: string;
}

interface GeoItem {
    kind: 'geo';
    result: GeoResult;
}

type PaletteItem = LayerItem | EntityItem | GeoItem;

const MAX_ENTITY_PER_LAYER = 4;
const MAX_GEO = 5;

function searchEntities(
    viewer: import('cesium').Viewer | null,
    query: string,
    visibleIds: Set<LayerId>,
): EntityItem[] {
    if (!viewer || viewer.isDestroyed() || query.length < 2) return [];
    const q = query.toLowerCase();
    const results: EntityItem[] = [];

    for (let i = 0; i < viewer.dataSources.length; i++) {
        const ds = viewer.dataSources.get(i);
        const layerId = ds.name as LayerId;
        if (!visibleIds.has(layerId)) continue;
        let count = 0;
        for (const entity of ds.entities.values) {
            if (count >= MAX_ENTITY_PER_LAYER) break;
            const name = entity.name ?? entity.id;
            if (name.toLowerCase().includes(q)) {
                results.push({
                    kind: 'entity',
                    entityId: entity.id,
                    name,
                    icon: LAYER_ICONS[layerId] ?? '',
                });
                count++;
            }
        }
    }
    return results;
}

interface CommandPaletteProps {
    onClose: () => void;
}

export function CommandPalette({ onClose }: CommandPaletteProps) {
    const [query, setQuery] = useState('');
    const [geoItems, setGeoItems] = useState<GeoItem[]>([]);
    const [entityItems, setEntityItems] = useState<EntityItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const viewer = useViewer();
    const visibleIds = useVisibleLayerIds();
    const { toggleLayer } = useLayerActions();

    const { visibility, statusMap, meta } = useLayerStore(
        useShallow((s) => ({ visibility: s.visibility, statusMap: s.status, meta: s.meta }))
    );

    useEffect(() => { inputRef.current?.focus(); }, []);

    const visibleIdSet = useMemo(() => new Set<LayerId>(visibleIds), [visibleIds]);

    const layerItems = useMemo<LayerItem[]>(() => {
        const q = query.toLowerCase().trim();
        return LAYER_DEFAULTS
            .filter((l) => !q || l.name.toLowerCase().includes(q) || l.id.toLowerCase().includes(q))
            .map((l) => ({
                kind: 'layer' as const,
                id: l.id,
                name: meta[l.id]?.name ?? l.name,
                icon: LAYER_ICONS[l.id] ?? '',
                visible: visibility[l.id] ?? false,
                count: statusMap[l.id]?.count ?? 0,
                color: meta[l.id]?.color ?? '#fff',
            }));
    }, [query, visibility, statusMap, meta]);

    useEffect(() => {
        const q = query.trim();
        if (q.length < 2) {
            setEntityItems([]);
            setGeoItems([]);
            setLoading(false);
            return;
        }
        setEntityItems(searchEntities(viewer, q, visibleIdSet));

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            setLoading(true);
            const geo = await geocode(q);
            setGeoItems(geo.slice(0, MAX_GEO).map((r): GeoItem => ({ kind: 'geo', result: r })));
            setLoading(false);
        }, 350);
    }, [query, viewer, visibleIdSet]);

    useEffect(() => { setHighlightIndex(0); }, [query]);

    const allItems = useMemo<PaletteItem[]>(
        () => [...layerItems, ...entityItems, ...geoItems],
        [layerItems, entityItems, geoItems]
    );

    const flyToGeo = useCallback((r: GeoResult) => {
        if (!viewer || viewer.isDestroyed()) return;
        const latSpan = Math.min(Math.abs(r.boundingbox[1] - r.boundingbox[0]), 30);
        const lonSpan = Math.min(Math.abs(r.boundingbox[3] - r.boundingbox[2]), 50);
        const alt = Math.max(Math.max(latSpan, lonSpan) * 111_000 * 1.5, 1_000);
        viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(r.lon, r.lat, alt), duration: 2 });
    }, [viewer]);

    const flyToEntity = useCallback((entityId: string) => {
        if (!viewer || viewer.isDestroyed()) return;
        for (let i = 0; i < viewer.dataSources.length; i++) {
            const ds = viewer.dataSources.get(i);
            const entity = ds.entities.getById(entityId);
            if (entity) {
                viewer.selectedEntity = entity;
                const pos = entity.position?.getValue(JulianDate.now());
                if (pos) viewer.camera.flyTo({ destination: pos, duration: 2 });
                break;
            }
        }
    }, [viewer]);

    const executeItem = useCallback((item: PaletteItem) => {
        if (item.kind === 'layer') {
            toggleLayer(item.id);
        } else if (item.kind === 'entity') {
            flyToEntity(item.entityId);
            onClose();
        } else {
            flyToGeo(item.result);
            onClose();
        }
    }, [toggleLayer, flyToEntity, flyToGeo, onClose]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { onClose(); return; }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIndex((p) => Math.min(p + 1, allItems.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIndex((p) => Math.max(p - 1, 0));
        } else if (e.key === 'Enter' && allItems[highlightIndex]) {
            e.preventDefault();
            executeItem(allItems[highlightIndex]);
        }
    };

    const sectionStart = {
        layers: 0,
        entities: layerItems.length,
        geo: layerItems.length + entityItems.length,
    };

    return (
        <div
            className="fixed inset-0 z-[60] flex items-start justify-center pt-20 animate-fade-in"
            style={{ background: 'rgba(0,0,8,0.75)', backdropFilter: 'blur(6px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className="animate-fade-in-up flex flex-col"
                style={{
                    background: 'rgba(8,8,22,0.97)',
                    border: '1px solid rgba(0,212,255,0.28)',
                    borderRadius: '0.875rem',
                    width: 'min(560px, calc(100vw - 2rem))',
                    maxHeight: 'calc(100vh - 8rem)',
                    boxShadow: '0 0 56px rgba(0,212,255,0.18), 0 24px 48px rgba(0,0,0,0.6)',
                    overflow: 'hidden',
                }}
            >
                {/* Input */}
                <div
                    className="flex items-center gap-3 px-4 py-3"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
                >
                    <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>⌕</span>
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Søk lag, enheter, steder..."
                        className="flex-1 bg-transparent text-sm outline-none font-mono"
                        style={{ color: 'var(--text-primary)', caretColor: 'var(--accent-blue)' }}
                    />
                    {loading && (
                        <span className="text-xs animate-pulse" style={{ color: 'var(--accent-blue)' }}>
                            ...
                        </span>
                    )}
                    <kbd
                        className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                        style={{
                            background: 'rgba(255,255,255,0.07)',
                            border: '1px solid rgba(255,255,255,0.14)',
                            color: 'var(--text-muted)',
                        }}
                    >
                        Esc
                    </kbd>
                </div>

                {/* Results */}
                <div ref={listRef} className="overflow-y-auto flex-1 min-h-0">
                    {/* Layers section */}
                    {layerItems.length > 0 && (
                        <div>
                            <div
                                className="px-4 pt-2 pb-1 font-mono text-[9px] uppercase tracking-widest"
                                style={{ color: 'rgba(255,255,255,0.3)' }}
                            >
                                Lag
                            </div>
                            {layerItems.map((item, i) => {
                                const idx = sectionStart.layers + i;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => executeItem(item)}
                                        onMouseEnter={() => setHighlightIndex(idx)}
                                        className="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors cursor-pointer"
                                        style={{ background: idx === highlightIndex ? 'rgba(255,255,255,0.08)' : 'transparent' }}
                                    >
                                        <span className="text-sm w-5 text-center shrink-0">{item.icon}</span>
                                        <span
                                            className="w-2 h-2 rounded-full shrink-0"
                                            style={{ background: item.visible ? item.color : '#333', boxShadow: item.visible ? `0 0 6px ${item.color}` : 'none' }}
                                        />
                                        <span
                                            className="flex-1 text-sm truncate"
                                            style={{ color: item.visible ? 'var(--text-primary)' : 'var(--text-muted)' }}
                                        >
                                            {item.name}
                                        </span>
                                        {item.count > 0 && (
                                            <span
                                                className="font-mono text-xs shrink-0 tabular-nums"
                                                style={{ color: 'rgba(255,255,255,0.3)' }}
                                            >
                                                {item.count.toLocaleString('nb-NO')}
                                            </span>
                                        )}
                                        <span
                                            className="font-mono text-[10px] px-2 py-0.5 rounded shrink-0"
                                            style={{
                                                background: item.visible ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.05)',
                                                border: `1px solid ${item.visible ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.1)'}`,
                                                color: item.visible ? 'var(--accent-blue)' : 'var(--text-muted)',
                                                minWidth: 28,
                                                textAlign: 'center',
                                            }}
                                        >
                                            {item.visible ? 'PÅ' : 'AV'}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Entities section */}
                    {entityItems.length > 0 && (
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <div
                                className="px-4 pt-2 pb-1 font-mono text-[9px] uppercase tracking-widest"
                                style={{ color: 'rgba(255,255,255,0.3)' }}
                            >
                                Enheter
                            </div>
                            {entityItems.map((item, i) => {
                                const idx = sectionStart.entities + i;
                                return (
                                    <button
                                        key={item.entityId}
                                        onClick={() => executeItem(item)}
                                        onMouseEnter={() => setHighlightIndex(idx)}
                                        className="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors cursor-pointer"
                                        style={{ background: idx === highlightIndex ? 'rgba(255,255,255,0.08)' : 'transparent' }}
                                    >
                                        <span className="text-sm w-5 text-center shrink-0">{item.icon}</span>
                                        <span
                                            className="flex-1 text-sm truncate"
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            {item.name}
                                        </span>
                                        <span className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
                                            fly til →
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Geo section */}
                    {geoItems.length > 0 && (
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <div
                                className="px-4 pt-2 pb-1 font-mono text-[9px] uppercase tracking-widest"
                                style={{ color: 'rgba(255,255,255,0.3)' }}
                            >
                                Steder
                            </div>
                            {geoItems.map((item, i) => {
                                const idx = sectionStart.geo + i;
                                return (
                                    <button
                                        key={`${item.result.lat}-${item.result.lon}`}
                                        onClick={() => executeItem(item)}
                                        onMouseEnter={() => setHighlightIndex(idx)}
                                        className="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors cursor-pointer"
                                        style={{ background: idx === highlightIndex ? 'rgba(255,255,255,0.08)' : 'transparent' }}
                                    >
                                        <span className="text-sm w-5 text-center shrink-0">📍</span>
                                        <span
                                            className="flex-1 text-sm truncate"
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            {item.result.name}
                                        </span>
                                        <span className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
                                            fly til →
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {allItems.length === 0 && query.length >= 2 && !loading && (
                        <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                            Ingen treff for «{query}»
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div
                    className="flex items-center gap-4 px-4 py-2"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
                >
                    <span className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>↑↓ naviger</span>
                    <span className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>↵ velg / toggle</span>
                    <span className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>Esc lukk</span>
                    <span className="ml-auto font-mono text-[10px]" style={{ color: 'rgba(0,212,255,0.4)' }}>Ctrl+K</span>
                </div>
            </div>
        </div>
    );
}
