import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle, useMemo } from 'react';
import { Cartesian3, JulianDate } from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';
import { geocode, type GeoResult } from '@/services/geocoding';
import { type LayerId, LAYER_ICONS } from '@/types/layers';

interface EntityResult {
    type: 'entity';
    layerId: LayerId;
    icon: string;
    color: string;
    entityId: string;
    name: string;
}

interface GeoSearchResult {
    type: 'geo';
    geoResult: GeoResult;
}

type SearchResult = EntityResult | GeoSearchResult;

const MAX_ENTITY_PER_LAYER = 5;

const LAYER_COLORS: Record<LayerId, string> = {
    flights: '#ffa500',
    ships: '#00d4ff',
    satellites: '#00ff88',
    weather: '#b0d4ff',
    webcams: '#ff4444',
    traffic: '#00cc44',
    trafficFlow: '#00cc44',
    infrastructure: '#ff9800',
    infrastructurePipelines: '#e65100',
    infrastructureFields: '#bf360c',
    power: '#FFD700',
    wind: '#4DB6AC',
    harbors: '#1E88E5',
    lighthouses: '#FF8F00',
    telecom: '#AB47BC',
    mines: '#8D6E63',
    buildings: '#aaccff',
    submarineCables: '#00d4ff',
    earthquakes: '#ff3333',
};

function searchEntities(viewer: import('cesium').Viewer | null, query: string, visibleLayerIds: Set<LayerId>): EntityResult[] {
    if (!viewer || viewer.isDestroyed() || query.length < 2) return [];
    const q = query.toLowerCase();
    const results: EntityResult[] = [];

    for (let i = 0; i < viewer.dataSources.length; i++) {
        const ds = viewer.dataSources.get(i);
        const layerId = ds.name as LayerId;
        if (!visibleLayerIds.has(layerId)) continue;

        let count = 0;
        for (const entity of ds.entities.values) {
            if (count >= MAX_ENTITY_PER_LAYER) break;
            const name = entity.name ?? entity.id;
            if (name.toLowerCase().includes(q)) {
                results.push({
                    type: 'entity',
                    layerId,
                    icon: LAYER_ICONS[layerId] ?? '',
                    color: LAYER_COLORS[layerId] ?? '#fff',
                    entityId: entity.id,
                    name,
                });
                count++;
            }
        }
    }
    return results;
}

export interface SearchBarHandle {
    focus: () => void;
}

export const SearchBar = forwardRef<SearchBarHandle>(function SearchBar(_, ref) {
    const viewer = useViewer();
    const { layers } = useLayers();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(-1);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
        focus: () => inputRef.current?.focus(),
    }));

    const visibleLayerIds = useMemo(
        () => new Set(layers.filter((l) => l.visible).map((l) => l.id)),
        [layers]
    );

    const flyTo = useCallback((result: GeoResult) => {
        if (!viewer || viewer.isDestroyed()) return;
        const [south, north, west, east] = result.boundingbox;
        // Cap bbox span to avoid overseas territories skewing the view
        const latSpan = Math.min(Math.abs(north - south), 30);
        const lonSpan = Math.min(Math.abs(east - west), 50);
        const maxSpan = Math.max(latSpan, lonSpan);
        // ~111km per degree, factor 1.5 for comfortable viewing margin
        const altitude = Math.max(maxSpan * 111_000 * 1.5, 1000);

        viewer.camera.flyTo({
            destination: Cartesian3.fromDegrees(result.lon, result.lat, altitude),
            duration: 2,
        });
    }, [viewer]);

    const flyToEntity = useCallback((entityId: string) => {
        if (!viewer || viewer.isDestroyed()) return;
        for (let i = 0; i < viewer.dataSources.length; i++) {
            const ds = viewer.dataSources.get(i);
            const entity = ds.entities.getById(entityId);
            if (entity) {
                viewer.selectedEntity = entity;
                const position = entity.position?.getValue(JulianDate.now());
                if (position) {
                    viewer.camera.flyTo({ destination: position, duration: 2 });
                }
                break;
            }
        }
    }, [viewer]);

    const selectResult = useCallback((result: SearchResult) => {
        if (result.type === 'geo') {
            flyTo(result.geoResult);
            setQuery(result.geoResult.name.split(',')[0]);
        } else {
            flyToEntity(result.entityId);
            setQuery(result.name);
        }
        setOpen(false);
        setHighlightIndex(-1);
    }, [flyTo, flyToEntity]);

    const handleInput = (value: string) => {
        setQuery(value);
        setHighlightIndex(-1);

        const entityResults = searchEntities(viewer, value, visibleLayerIds);
        setResults(entityResults);
        setOpen(entityResults.length > 0);

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            if (value.length < 2) return;
            setLoading(true);
            const geoResults = await geocode(value);
            setResults((prev) => [
                ...prev.filter((r) => r.type === 'entity'),
                ...geoResults.map((g): GeoSearchResult => ({ type: 'geo', geoResult: g })),
            ]);
            setOpen(true);
            setLoading(false);
        }, 400);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            setOpen(false);
            setHighlightIndex(-1);
            inputRef.current?.blur();
            return;
        }

        if (!open || results.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIndex((prev) => Math.min(prev + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIndex((prev) => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' && highlightIndex >= 0) {
            e.preventDefault();
            selectResult(results[highlightIndex]);
        }
    };

    // Close on click outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Group entity results by layer
    const entityGroups = useMemo(() => {
        const groups: Map<LayerId, EntityResult[]> = new Map();
        for (const r of results) {
            if (r.type !== 'entity') continue;
            const arr = groups.get(r.layerId) ?? [];
            arr.push(r);
            groups.set(r.layerId, arr);
        }
        return groups;
    }, [results]);

    const geoResults = useMemo(
        () => results.filter((r): r is GeoSearchResult => r.type === 'geo'),
        [results]
    );

    // Build flat index for highlight tracking
    const flatResults = useMemo(() => {
        const flat: SearchResult[] = [];
        for (const items of entityGroups.values()) flat.push(...items);
        flat.push(...geoResults);
        return flat;
    }, [entityGroups, geoResults]);

    // Keep highlightIndex in sync with flatResults
    let flatIndex = 0;

    return (
        <div ref={containerRef} className="relative w-72">
            <div className="flex items-center bg-[var(--bg-ui)] backdrop-blur-md border border-white/10 rounded-lg overflow-hidden">
                <span className="pl-3 text-[var(--text-muted)] text-sm">🔍</span>
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => handleInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => results.length > 0 && setOpen(true)}
                    placeholder="Søk sted, fly, skip..."
                    className="w-full bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none font-sans"
                />
                {loading && (
                    <span className="pr-3 text-[var(--accent-blue)] text-xs animate-pulse">...</span>
                )}
            </div>

            {open && flatResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-ui)] backdrop-blur-md border border-white/10 rounded-lg overflow-hidden shadow-2xl z-50 max-h-80 overflow-y-auto">
                    {[...entityGroups.entries()].map(([layerId, items]) => (
                        <div key={layerId}>
                            <div
                                className="px-3 py-1 text-xs font-mono uppercase tracking-wider"
                                style={{ color: LAYER_COLORS[layerId] }}
                            >
                                {LAYER_ICONS[layerId]} {layers.find((l) => l.id === layerId)?.name}
                            </div>
                            {items.map((r) => {
                                const idx = flatIndex++;
                                return (
                                    <button
                                        key={r.entityId}
                                        onClick={() => selectResult(r)}
                                        onMouseEnter={() => setHighlightIndex(idx)}
                                        className={`w-full text-left px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors cursor-pointer ${
                                            idx === highlightIndex ? 'bg-white/15' : 'hover:bg-white/10'
                                        }`}
                                    >
                                        <span className="block truncate">{r.name}</span>
                                    </button>
                                );
                            })}
                        </div>
                    ))}

                    {geoResults.length > 0 && (
                        <>
                            <div className="px-3 py-1 text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">
                                📍 Steder
                            </div>
                            {geoResults.map((r) => {
                                const idx = flatIndex++;
                                return (
                                    <button
                                        key={r.geoResult.name}
                                        onClick={() => selectResult(r)}
                                        onMouseEnter={() => setHighlightIndex(idx)}
                                        className={`w-full text-left px-4 py-2.5 text-sm text-[var(--text-secondary)] transition-colors cursor-pointer border-b border-white/5 last:border-0 ${
                                            idx === highlightIndex ? 'bg-white/15' : 'hover:bg-white/10'
                                        }`}
                                    >
                                        <span className="block truncate">{r.geoResult.name}</span>
                                    </button>
                                );
                            })}
                        </>
                    )}
                </div>
            )}
        </div>
    );
});
