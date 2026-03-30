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
    const [hovered, setHovered] = useState(false);

    return (
        <div
            className="relative group"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <button
                onClick={onClick}
                className="px-3 py-1.5 rounded-lg text-sm font-mono whitespace-nowrap
                           bg-white/5 hover:bg-white/15 border border-white/10 hover:border-white/25
                           text-white/80 hover:text-white transition-all duration-150"
            >
                {item.name}
            </button>
            {hovered && (
                <button
                    onClick={(e) => { e.stopPropagation(); onStar(); }}
                    className={`absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[9px]
                                flex items-center justify-center transition-colors
                                ${isStarred ? 'bg-amber-400 text-black' : 'bg-white/20 text-white/60 hover:bg-amber-400/60'}`}
                    title={isStarred ? 'Fjern favoritt' : 'Legg til favoritt'}
                >
                    ★
                </button>
            )}
        </div>
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
            const country = COUNTRIES.find(
                (c) => c.countryCode === result.country.toLowerCase() ||
                       c.name.toLowerCase() === result.country.toLowerCase()
            );
            if (!country) return;
            const region = WORLD_REGIONS.find((r) => r.id === country.region);
            setBreadcrumb({ region: region ?? undefined, country });
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            const alt = info?.alt ?? 0;

            if (level === 'region') {
                const sorted = sortByDistance(WORLD_REGIONS, lat, lon);
                setItems(alt > HIGH_ALTITUDE ? sorted : sorted);
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
            className="absolute bottom-9 right-4 z-20 flex flex-col items-end gap-1"
        >
            {/* ── Floating panel ───────────────────────────────────────── */}
            {panelOpen && (
                <div className="backdrop-blur-md bg-black/70 border border-white/10 rounded-xl
                                shadow-2xl w-80 max-h-96 overflow-hidden flex flex-col">
                    {/* Panel header */}
                    {openLevel && (
                        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                            <span className="text-white/50 text-xs font-mono uppercase tracking-widest">
                                {panelTitle()}
                            </span>
                            <button
                                onClick={() => { setOpenLevel(null); setShowFavorites(false); }}
                                className="text-white/40 hover:text-white/80 text-sm leading-none"
                            >
                                ✕
                            </button>
                        </div>
                    )}

                    {/* Items grid */}
                    {openLevel && (
                        <div className="flex-1 overflow-y-auto p-2">
                            {loading ? (
                                <div className="flex items-center justify-center py-6">
                                    <div className="w-4 h-4 border border-white/30 border-t-white/80
                                                    rounded-full animate-spin" />
                                </div>
                            ) : items.length === 0 ? (
                                <p className="text-white/30 text-xs font-mono text-center py-4">
                                    Ingen steder funnet
                                </p>
                            ) : (
                                <div className="flex flex-wrap gap-1.5">
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

                    {/* Favorites section */}
                    {showFavorites && (
                        <div className="border-t border-white/10">
                            <div className="flex items-center justify-between px-3 py-2">
                                <span className="text-amber-400/80 text-xs font-mono uppercase tracking-widest">
                                    ★ Favoritter
                                </span>
                                <button
                                    onClick={addCurrentPosition}
                                    className="text-[10px] font-mono text-white/40 hover:text-white/70
                                               border border-white/10 hover:border-white/20 rounded px-1.5 py-0.5
                                               transition-colors"
                                    title="Lagre nåværende kameraposisjon"
                                >
                                    + Legg til
                                </button>
                            </div>
                            <div className="px-2 pb-2 max-h-36 overflow-y-auto">
                                {favorites.length === 0 ? (
                                    <p className="text-white/20 text-xs font-mono text-center py-2">
                                        Ingen favoritter ennå
                                    </p>
                                ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                        {favorites.map((fav) => (
                                            <div key={fav.id} className="relative group">
                                                <button
                                                    onClick={() => navigateTo(fav)}
                                                    className="px-3 py-1.5 rounded-lg text-sm font-mono
                                                               bg-amber-400/10 hover:bg-amber-400/20
                                                               border border-amber-400/20 hover:border-amber-400/40
                                                               text-amber-300/80 hover:text-amber-200
                                                               transition-all duration-150"
                                                >
                                                    {fav.name}
                                                </button>
                                                <button
                                                    onClick={() => removeFavorite(fav.id)}
                                                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full
                                                               bg-red-500/70 text-white text-[9px] hidden group-hover:flex
                                                               items-center justify-center"
                                                    title="Fjern"
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

            {/* ── Compact bar (always visible) ──────────────────────────── */}
            <div className="flex items-center gap-1 backdrop-blur-md bg-black/60 border border-white/10
                            rounded-lg px-2 py-1 shadow-lg">
                {/* Globe icon — opens region picker */}
                <button
                    onClick={() => openPanel('region')}
                    className={`text-base leading-none px-1 transition-colors
                                ${openLevel === 'region' ? 'text-cyan-400' : 'text-white/40 hover:text-white/80'}`}
                    title="Velg region"
                >
                    ◎
                </button>

                <span className="text-white/20 text-xs">│</span>

                {/* Breadcrumb chips */}
                <div className="flex items-center gap-1 font-mono text-xs">
                    {breadcrumb.region ? (
                        <button
                            onClick={() => openPanel('region')}
                            className={`text-white/60 hover:text-white transition-colors
                                        ${openLevel === 'region' ? 'text-cyan-400' : ''}`}
                        >
                            {breadcrumb.region.name}
                        </button>
                    ) : (
                        <button
                            onClick={() => openPanel('region')}
                            className="text-white/25 hover:text-white/50 transition-colors"
                        >
                            Region
                        </button>
                    )}

                    {breadcrumb.region && (
                        <>
                            <span className="text-white/20">›</span>
                            <button
                                onClick={() => openPanel('country')}
                                className={`transition-colors
                                            ${openLevel === 'country' ? 'text-cyan-400' : 'text-white/60 hover:text-white'}`}
                            >
                                {breadcrumb.country?.name ?? <span className="text-white/25">Land</span>}
                            </button>
                        </>
                    )}

                    {breadcrumb.country && (
                        <>
                            <span className="text-white/20">›</span>
                            <button
                                onClick={() => openPanel('city')}
                                className={`transition-colors
                                            ${openLevel === 'city' ? 'text-cyan-400' : 'text-white/60 hover:text-white'}`}
                            >
                                {breadcrumb.city?.name ?? <span className="text-white/25">By</span>}
                            </button>
                        </>
                    )}

                    {breadcrumb.city && (
                        <>
                            <span className="text-white/20">›</span>
                            <button
                                onClick={() => openPanel('place')}
                                className={`transition-colors
                                            ${openLevel === 'place' ? 'text-cyan-400' : 'text-white/40 hover:text-white/70'}`}
                            >
                                Steder
                            </button>
                        </>
                    )}
                </div>

                <span className="text-white/20 text-xs">│</span>

                {/* Favorites toggle */}
                <button
                    onClick={() => {
                        setShowFavorites((v) => !v);
                        if (!showFavorites) setOpenLevel(null);
                    }}
                    className={`text-xs font-mono px-1 transition-colors
                                ${showFavorites ? 'text-amber-400' : 'text-white/40 hover:text-amber-400/70'}`}
                    title="Favoritter"
                >
                    ★{favorites.length > 0 && <span className="ml-0.5">{favorites.length}</span>}
                </button>
            </div>
        </div>
    );
}
