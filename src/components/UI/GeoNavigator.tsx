import { useState, useEffect, useRef, useCallback } from 'react';
import { Math as CesiumMath, Cartesian3 } from 'cesium';
import { useViewer } from '../../context/ViewerContext';
import { useOrbit } from '../../context/OrbitContext';
import { reverseGeocode } from '../../services/geocoding';
import {
    getCitiesForCountry,
    getPlacesForCity,
    getNearbyEntities,
    sortByDistance,
} from '../../services/geoNavigatorService';
import { WORLD_REGIONS, COUNTRIES, type GeoNavItem } from '../../data/geoNavData';

type NavLevel = 'region' | 'country' | 'city' | 'place';

interface FavoriteItem extends GeoNavItem {
    addedAt: number;
}

const LS_KEY = 'worldview-nav-favorites';
const HIGH_ALTITUDE = 3_000_000;

function loadFavorites(): FavoriteItem[] {
    try {
        return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
    } catch {
        return [];
    }
}

function saveFavorites(favs: FavoriteItem[]): void {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(favs));
    } catch {
        // Ignore quota errors
    }
}

function getCameraInfo(viewer: ReturnType<typeof useViewer>): { lat: number; lon: number; alt: number } | null {
    if (!viewer || viewer.isDestroyed()) return null;
    try {
        const carto = viewer.camera.positionCartographic;
        return {
            lat: CesiumMath.toDegrees(carto.latitude),
            lon: CesiumMath.toDegrees(carto.longitude),
            alt: carto.height,
        };
    } catch {
        return null;
    }
}

interface Breadcrumb {
    region?: GeoNavItem;
    country?: GeoNavItem;
    city?: GeoNavItem;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function ItemChip({
    item,
    onClick,
    onStar,
    isStarred,
}: {
    item: GeoNavItem;
    onClick: () => void;
    onStar: () => void;
    isStarred: boolean;
}) {
    return (
        <div className="relative group">
            <button
                onClick={onClick}
                className="w-full px-3 py-2 rounded-lg text-sm font-mono text-left
                           bg-white/5 hover:bg-white/15 border border-white/10 hover:border-white/25
                           text-white/80 hover:text-white transition-all duration-150"
            >
                {item.name}
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); onStar(); }}
                className={`absolute top-0.5 right-0.5 w-4 h-4 rounded text-[9px]
                            items-center justify-center transition-all hidden group-hover:flex
                            ${isStarred ? 'bg-amber-400 text-black' : 'bg-black/60 text-white/40 hover:text-amber-400'}`}
                title={isStarred ? 'Fjern favoritt' : 'Legg til favoritt'}
            >
                ★
            </button>
        </div>
    );
}

function NavColumn({
    label,
    value,
    active,
    onClick,
}: {
    label: string;
    value?: string;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 px-4 py-2.5
                        transition-colors group relative
                        ${active ? 'bg-white/8' : 'hover:bg-white/5'}`}
        >
            <span className={`text-[10px] font-mono uppercase tracking-widest transition-colors
                              ${active ? 'text-cyan-400/80' : 'text-white/30 group-hover:text-white/50'}`}>
                {label}
            </span>
            <span className={`text-sm font-mono font-medium transition-colors
                              ${active ? 'text-cyan-300' : value ? 'text-white/80 group-hover:text-white' : 'text-white/25 group-hover:text-white/40'}`}>
                {value ?? '—'}
            </span>
            {active && (
                <span className="absolute bottom-0 left-2 right-2 h-px bg-cyan-400/60 rounded-full" />
            )}
        </button>
    );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function GeoNavigator() {
    const viewer = useViewer();
    const { orbitActive, setOrbitActive } = useOrbit();

    const [breadcrumb, setBreadcrumb] = useState<Breadcrumb>({});
    const [openLevel, setOpenLevel] = useState<NavLevel | null>(null);
    const [items, setItems] = useState<GeoNavItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [showFavorites, setShowFavorites] = useState(false);
    const [favorites, setFavorites] = useState<FavoriteItem[]>(loadFavorites);
    const panelRef = useRef<HTMLDivElement>(null);
    const orbitRef = useRef(orbitActive);
    orbitRef.current = orbitActive;

    // ── Fly-to helper ─────────────────────────────────────────────────────
    const navigateTo = useCallback(
        (item: GeoNavItem, opts?: { keepPanel?: boolean }) => {
            if (!viewer || viewer.isDestroyed()) return;
            const wasOrbit = orbitRef.current;
            if (wasOrbit) setOrbitActive(false);
            if (!opts?.keepPanel) setOpenLevel(null);

            viewer.camera.flyTo({
                destination: Cartesian3.fromDegrees(item.lon, item.lat, item.altitude),
                duration: 2,
                complete: () => {
                    if (wasOrbit) setOrbitActive(true);
                },
            });
        },
        [viewer, setOrbitActive]
    );

    // ── Detect camera position on mount ──────────────────────────────────
    useEffect(() => {
        if (!viewer) return;
        const info = getCameraInfo(viewer);
        if (!info) return;
        if (info.alt > HIGH_ALTITUDE) return; // Too high — skip detection

        reverseGeocode(info.lat, info.lon).then((result) => {
            if (!result) return;
            // result.country is a full name (e.g. "Norge") — match by name
            const country = COUNTRIES.find(
                (c) => c.name.toLowerCase() === result.country.toLowerCase()
            );
            if (!country) return;
            const region = WORLD_REGIONS.find((r) => r.id === country.region);
            setBreadcrumb({ region: region ?? undefined, country });
        });
    }, [viewer]);

    // ── Level population ──────────────────────────────────────────────────
    const openPanel = useCallback(
        async (level: NavLevel) => {
            if (openLevel === level) {
                setOpenLevel(null);
                return;
            }
            setOpenLevel(level);
            setLoading(true);
            setItems([]);

            const info = getCameraInfo(viewer);
            const lat = info?.lat ?? 0;
            const lon = info?.lon ?? 0;

            if (level === 'region') {
                setItems(sortByDistance(WORLD_REGIONS, lat, lon));
                setLoading(false);
                return;
            }

            if (level === 'country') {
                const regionId = breadcrumb.region?.id;
                const pool = regionId
                    ? COUNTRIES.filter((c) => c.region === regionId)
                    : COUNTRIES;
                setItems(sortByDistance(pool, lat, lon));
                setLoading(false);
                return;
            }

            if (level === 'city') {
                const countryCode = breadcrumb.country?.countryCode;
                if (!countryCode) {
                    setLoading(false);
                    return;
                }
                const cities = await getCitiesForCountry(countryCode, lat, lon);
                setItems(cities);
                setLoading(false);
                return;
            }

            if (level === 'place') {
                const city = breadcrumb.city;
                const country = breadcrumb.country;
                if (!city || !country?.countryCode) {
                    setLoading(false);
                    return;
                }
                const [nominatimPlaces, nearbyEntities] = await Promise.all([
                    getPlacesForCity(city.name, country.countryCode),
                    Promise.resolve(viewer ? getNearbyEntities(viewer, lat, lon) : []),
                ]);
                // Merge, deduplicate by proximity
                const all = [...nearbyEntities, ...nominatimPlaces];
                const seen = new Set<string>();
                const unique = all.filter((p) => {
                    const key = `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
                setItems(unique.slice(0, 20));
                setLoading(false);
                return;
            }
        },
        [openLevel, viewer, breadcrumb]
    );

    // ── Item click: fly + drill to next level ─────────────────────────────
    const handleItemClick = useCallback(
        async (item: GeoNavItem, level: NavLevel) => {
            navigateTo(item);

            if (level === 'region') {
                setBreadcrumb({ region: item });
                // Auto-open country level
                const info = getCameraInfo(viewer);
                const lat = info?.lat ?? 0;
                const lon = info?.lon ?? 0;
                const pool = COUNTRIES.filter((c) => c.region === item.id);
                setItems(sortByDistance(pool, lat, lon));
                setOpenLevel('country');
            } else if (level === 'country') {
                setBreadcrumb((prev) => ({ region: prev.region, country: item }));
                const info = getCameraInfo(viewer);
                const lat = info?.lat ?? 0;
                const lon = info?.lon ?? 0;
                const countryCode = (item as typeof COUNTRIES[number]).countryCode;
                setLoading(true);
                const cities = await getCitiesForCountry(countryCode, lat, lon);
                setItems(cities);
                setLoading(false);
                setOpenLevel('city');
            } else if (level === 'city') {
                setBreadcrumb((prev) => ({ ...prev, city: item }));
                const countryCode = breadcrumb.country?.countryCode ?? '';
                setLoading(true);
                const [places, entities] = await Promise.all([
                    getPlacesForCity(item.name, countryCode),
                    Promise.resolve(viewer ? getNearbyEntities(viewer, item.lat, item.lon) : []),
                ]);
                const all = [...entities, ...places];
                const seen = new Set<string>();
                const unique = all.filter((p) => {
                    const key = `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
                setItems(unique.slice(0, 20));
                setLoading(false);
                setOpenLevel('place');
            } else {
                // place level → just fly, close panel
                setOpenLevel(null);
            }
        },
        [navigateTo, viewer, breadcrumb]
    );

    // ── Favorites ─────────────────────────────────────────────────────────
    const isFavorite = useCallback(
        (item: GeoNavItem) => favorites.some((f) => f.id === item.id),
        [favorites]
    );

    const toggleFavorite = useCallback(
        (item: GeoNavItem) => {
            setFavorites((prev) => {
                const exists = prev.find((f) => f.id === item.id);
                const updated = exists
                    ? prev.filter((f) => f.id !== item.id)
                    : [...prev, { ...item, addedAt: Date.now() }];
                saveFavorites(updated);
                return updated;
            });
        },
        []
    );

    const addCurrentPosition = useCallback(() => {
        const info = getCameraInfo(viewer);
        if (!info) return;
        const fav: FavoriteItem = {
            id: `fav-pos-${Date.now()}`,
            name: breadcrumb.city?.name ?? breadcrumb.country?.name ?? 'Min posisjon',
            lat: info.lat,
            lon: info.lon,
            altitude: Math.max(info.alt, 15_000),
            addedAt: Date.now(),
        };
        setFavorites((prev) => {
            const updated = [...prev, fav];
            saveFavorites(updated);
            return updated;
        });
    }, [viewer, breadcrumb]);

    const removeFavorite = useCallback((id: string) => {
        setFavorites((prev) => {
            const updated = prev.filter((f) => f.id !== id);
            saveFavorites(updated);
            return updated;
        });
    }, []);

    // ── Close panel on outside click ──────────────────────────────────────
    useEffect(() => {
        function onPointerDown(e: PointerEvent) {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setOpenLevel(null);
                setShowFavorites(false);
            }
        }
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, []);

    // ── Panel title ───────────────────────────────────────────────────────
    const panelTitle = () => {
        if (openLevel === 'region') return 'Velg region';
        if (openLevel === 'country') return breadcrumb.region ? `Land i ${breadcrumb.region.name}` : 'Velg land';
        if (openLevel === 'city') return breadcrumb.country ? `Byer i ${breadcrumb.country.name}` : 'Velg by';
        if (openLevel === 'place') return breadcrumb.city ? `Steder nær ${breadcrumb.city.name}` : 'Velg sted';
        return '';
    };

    // ── Render ────────────────────────────────────────────────────────────
    const panelOpen = openLevel !== null || showFavorites;

    return (
        <div
            ref={panelRef}
            className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 flex flex-col items-stretch gap-1"
            style={{ width: 'clamp(400px, 50vw, 640px)' }}
        >
            {/* ── Panel (slides up from nav bar) ───────────────────────── */}
            {panelOpen && (
                <div className="backdrop-blur-md bg-black/80 border border-white/10 rounded-xl
                                shadow-2xl overflow-hidden flex flex-col"
                     style={{ maxHeight: '260px' }}>

                    {/* Panel header */}
                    {openLevel && (
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8">
                            <span className="text-[11px] font-mono uppercase tracking-widest text-white/40">
                                {panelTitle()}
                            </span>
                            <button
                                onClick={() => { setOpenLevel(null); setShowFavorites(false); }}
                                className="text-white/30 hover:text-white/70 text-sm leading-none transition-colors"
                            >
                                ✕
                            </button>
                        </div>
                    )}

                    {/* Items grid */}
                    {openLevel && (
                        <div className="flex-1 overflow-y-auto p-3">
                            {loading ? (
                                <div className="flex items-center justify-center py-8">
                                    <div className="w-5 h-5 border border-white/20 border-t-white/70
                                                    rounded-full animate-spin" />
                                </div>
                            ) : items.length === 0 ? (
                                <p className="text-white/25 text-xs font-mono text-center py-6">
                                    Ingen steder funnet
                                </p>
                            ) : (
                                <div className="grid gap-1.5"
                                     style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
                                    {items.map((item) => (
                                        <ItemChip
                                            key={item.id}
                                            item={item}
                                            onClick={() => handleItemClick(item, openLevel)}
                                            onStar={() => toggleFavorite(item)}
                                            isStarred={isFavorite(item)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Favorites panel */}
                    {showFavorites && (
                        <div className={openLevel ? 'border-t border-white/10' : ''}>
                            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8">
                                <span className="text-[11px] font-mono uppercase tracking-widest text-amber-400/70">
                                    ★ Favoritter
                                </span>
                                <button
                                    onClick={addCurrentPosition}
                                    className="text-[10px] font-mono text-white/40 hover:text-white/70
                                               border border-white/10 hover:border-white/25 rounded px-2 py-0.5
                                               transition-colors"
                                    title="Lagre nåværende kameraposisjon"
                                >
                                    + Legg til her
                                </button>
                            </div>
                            <div className="p-3 overflow-y-auto" style={{ maxHeight: '120px' }}>
                                {favorites.length === 0 ? (
                                    <p className="text-white/20 text-xs font-mono text-center py-3">
                                        Ingen favoritter ennå — klikk ★ på et sted
                                    </p>
                                ) : (
                                    <div className="grid gap-1.5"
                                         style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
                                        {favorites.map((fav) => (
                                            <div key={fav.id} className="relative group">
                                                <button
                                                    onClick={() => navigateTo(fav)}
                                                    className="w-full px-3 py-2 rounded-lg text-sm font-mono text-left
                                                               bg-amber-400/8 hover:bg-amber-400/18
                                                               border border-amber-400/15 hover:border-amber-400/35
                                                               text-amber-300/80 hover:text-amber-200
                                                               transition-all duration-150"
                                                >
                                                    {fav.name}
                                                </button>
                                                <button
                                                    onClick={() => removeFavorite(fav.id)}
                                                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded text-[9px]
                                                               bg-black/60 text-white/30 hover:text-red-400
                                                               hidden group-hover:flex items-center justify-center
                                                               transition-colors"
                                                    title="Fjern favoritt"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Always-visible nav bar (3 columns) ───────────────────── */}
            <div className="flex backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-2xl divide-x divide-white/8"
                 style={{ background: 'rgba(8, 8, 18, 0.85)' }}>

                <NavColumn
                    label="Region"
                    value={breadcrumb.region?.name}
                    active={openLevel === 'region'}
                    onClick={() => openPanel('region')}
                />

                <NavColumn
                    label="Land"
                    value={breadcrumb.country?.name}
                    active={openLevel === 'country'}
                    onClick={() => openPanel('country')}
                />

                <NavColumn
                    label="By"
                    value={breadcrumb.city?.name}
                    active={openLevel === 'city'}
                    onClick={() => openPanel('city')}
                />

                <NavColumn
                    label="Steder"
                    value={breadcrumb.city ? '...' : undefined}
                    active={openLevel === 'place'}
                    onClick={() => openPanel('place')}
                />

                {/* Divider + Favorites */}
                <button
                    onClick={() => {
                        setShowFavorites((v) => !v);
                        if (!showFavorites) setOpenLevel(null);
                    }}
                    className={`flex flex-col items-center justify-center gap-0.5 px-4 py-2.5
                                transition-colors
                                ${showFavorites ? 'bg-amber-400/10 text-amber-400' : 'hover:bg-white/5 text-white/30 hover:text-amber-400/70'}`}
                    title="Favoritter"
                >
                    <span className="text-base leading-none">★</span>
                    {favorites.length > 0 && (
                        <span className="text-[10px] font-mono">{favorites.length}</span>
                    )}
                </button>
            </div>
        </div>
    );
}
