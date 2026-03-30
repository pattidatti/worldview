import { Viewer, Cartographic, Math as CesiumMath, JulianDate } from 'cesium';
import { type GeoNavItem } from '../data/geoNavData';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const SESSION_TTL = 30 * 60 * 1000; // 30 min

interface CachedEntry<T> {
    data: T;
    ts: number;
}

function sessionGet<T>(key: string): T | null {
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        const entry: CachedEntry<T> = JSON.parse(raw);
        if (Date.now() - entry.ts > SESSION_TTL) {
            sessionStorage.removeItem(key);
            return null;
        }
        return entry.data;
    } catch {
        return null;
    }
}

function sessionSet<T>(key: string, data: T): void {
    try {
        sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
    } catch {
        // Ignore quota errors
    }
}

// Haversine distance in km
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface NominatimResult {
    display_name: string;
    lat: string;
    lon: string;
    type: string;
    class: string;
    address?: {
        city?: string;
        town?: string;
        village?: string;
        county?: string;
        state?: string;
    };
}

export async function getCitiesForCountry(
    countryCode: string,
    cameraLat: number,
    cameraLon: number
): Promise<GeoNavItem[]> {
    const cacheKey = `geonav-cities-${countryCode}`;
    const cached = sessionGet<GeoNavItem[]>(cacheKey);
    if (cached) {
        return cached.slice().sort((a, b) =>
            haversine(cameraLat, cameraLon, a.lat, a.lon) -
            haversine(cameraLat, cameraLon, b.lat, b.lon)
        );
    }

    const params = new URLSearchParams({
        q: '',
        format: 'json',
        limit: '30',
        addressdetails: '1',
        featureType: 'city',
        countrycodes: countryCode,
        'accept-language': 'nb',
    });

    try {
        const res = await fetch(`${NOMINATIM_URL}?${params}`, {
            headers: { 'User-Agent': 'WorldView/0.1' },
        });
        if (!res.ok) return [];

        const data: NominatimResult[] = await res.json();

        const cities: GeoNavItem[] = data
            .filter((r) => r.class === 'place' || r.type === 'city' || r.type === 'town')
            .map((r, i) => {
                const addr = r.address ?? {};
                const shortName = addr.city ?? addr.town ?? addr.village ?? addr.county ?? r.display_name.split(',')[0].trim();
                return {
                    id: `city-${countryCode}-${i}`,
                    name: shortName,
                    lat: parseFloat(r.lat),
                    lon: parseFloat(r.lon),
                    altitude: 150_000,
                    countryCode,
                };
            })
            .filter((c) => c.name.length > 0);

        sessionSet(cacheKey, cities);
        return cities.sort((a, b) =>
            haversine(cameraLat, cameraLon, a.lat, a.lon) -
            haversine(cameraLat, cameraLon, b.lat, b.lon)
        );
    } catch {
        return [];
    }
}

export async function getPlacesForCity(
    cityName: string,
    countryCode: string
): Promise<GeoNavItem[]> {
    const cacheKey = `geonav-places-${cityName}-${countryCode}`;
    const cached = sessionGet<GeoNavItem[]>(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams({
        q: cityName,
        format: 'json',
        limit: '20',
        addressdetails: '1',
        countrycodes: countryCode,
        'accept-language': 'nb',
    });

    try {
        const res = await fetch(`${NOMINATIM_URL}?${params}`, {
            headers: { 'User-Agent': 'WorldView/0.1' },
        });
        if (!res.ok) return [];

        const data: NominatimResult[] = await res.json();

        const places: GeoNavItem[] = data
            .filter((r) => ['tourism', 'amenity', 'historic', 'natural', 'place', 'aeroway'].includes(r.class))
            .map((r, i) => ({
                id: `place-${cityName}-${i}`,
                name: r.display_name.split(',')[0].trim(),
                lat: parseFloat(r.lat),
                lon: parseFloat(r.lon),
                altitude: 15_000,
                countryCode,
            }))
            .filter((p) => p.name.length > 0);

        sessionSet(cacheKey, places);
        return places;
    } catch {
        return [];
    }
}

export function getNearbyEntities(
    viewer: Viewer,
    lat: number,
    lon: number,
    maxCount = 5
): GeoNavItem[] {
    const results: Array<{ item: GeoNavItem; dist: number }> = [];

    for (let i = 0; i < viewer.dataSources.length; i++) {
        const ds = viewer.dataSources.get(i);
        const entities = ds.entities.values;
        for (const entity of entities) {
            if (!entity.position) continue;
            const pos = entity.position.getValue(JulianDate.now());
            if (!pos) continue;
            const carto = Cartographic.fromCartesian(pos);
            const eLat = CesiumMath.toDegrees(carto.latitude);
            const eLon = CesiumMath.toDegrees(carto.longitude);
            const dist = haversine(lat, lon, eLat, eLon);
            const name =
                (entity.name ?? '') ||
                (entity.properties?.getValue(JulianDate.now())?.name ?? '') ||
                entity.id;
            results.push({
                item: {
                    id: `entity-${entity.id}`,
                    name: String(name).substring(0, 40),
                    lat: eLat,
                    lon: eLon,
                    altitude: Math.max(carto.height + 5000, 15_000),
                },
                dist,
            });
        }
    }

    return results
        .sort((a, b) => a.dist - b.dist)
        .slice(0, maxCount)
        .map((r) => r.item);
}

export function sortByDistance(items: GeoNavItem[], lat: number, lon: number): GeoNavItem[] {
    return items.slice().sort(
        (a, b) =>
            haversine(lat, lon, a.lat, a.lon) -
            haversine(lat, lon, b.lat, b.lon)
    );
}
