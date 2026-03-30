export interface GeoResult {
    name: string;
    lat: number;
    lon: number;
    type: string;
    boundingbox: [number, number, number, number]; // [south, north, west, east]
}

export interface ReverseGeoResult {
    name: string;
    country: string;
    state?: string;
    county?: string;
    city?: string;
    lat: number;
    lon: number;
    osmId: number;
    type: string;
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';

// Forward geocode cache — keyed by query (lowercase). Max 100 entries.
const forwardCache = new Map<string, GeoResult[]>();

// Reverse geocode cache — keyed by rounded grid (~11 km cells).
const reverseCache = new Map<string, ReverseGeoResult | null>();

// Nominatim rate limiter: max 1 req/s.
let lastReverseReqAt = 0;

export async function geocode(query: string): Promise<GeoResult[]> {
    const key = query.toLowerCase();
    const cached = forwardCache.get(key);
    if (cached) return cached;

    const params = new URLSearchParams({
        q: query,
        format: 'json',
        limit: '5',
        addressdetails: '0',
    });

    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
        headers: { 'User-Agent': 'WorldView/0.1' },
    });

    if (!res.ok) return [];

    const data = await res.json();
    const results: GeoResult[] = data.map((r: { display_name: string; lat: string; lon: string; type: string; boundingbox: string[] }) => ({
        name: r.display_name,
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
        type: r.type,
        boundingbox: [
            parseFloat(r.boundingbox[0]),
            parseFloat(r.boundingbox[1]),
            parseFloat(r.boundingbox[2]),
            parseFloat(r.boundingbox[3]),
        ] as [number, number, number, number],
    }));

    if (forwardCache.size >= 100) {
        const firstKey = forwardCache.keys().next().value;
        if (firstKey !== undefined) forwardCache.delete(firstKey);
    }
    forwardCache.set(key, results);
    return results;
}

export async function reverseGeocode(lat: number, lon: number): Promise<ReverseGeoResult | null> {
    const cacheKey = `${lat.toFixed(1)},${lon.toFixed(1)}`;
    if (reverseCache.has(cacheKey)) return reverseCache.get(cacheKey) ?? null;

    // Enforce Nominatim 1 req/s policy
    const now = Date.now();
    const wait = lastReverseReqAt + 1100 - now;
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastReverseReqAt = Date.now();

    const params = new URLSearchParams({
        lat: lat.toString(),
        lon: lon.toString(),
        format: 'json',
        addressdetails: '1',
        'accept-language': 'nb',
        zoom: '10',
    });

    const res = await fetch(`${NOMINATIM_REVERSE_URL}?${params}`, {
        headers: { 'User-Agent': 'WorldView/0.1' },
    });

    if (!res.ok) {
        reverseCache.set(cacheKey, null);
        return null;
    }

    const data = await res.json();
    if (data.error) {
        reverseCache.set(cacheKey, null);
        return null;
    }

    const addr = data.address ?? {};
    const result: ReverseGeoResult = {
        name: data.display_name,
        country: addr.country ?? '',
        state: addr.state,
        county: addr.county,
        city: addr.city ?? addr.town ?? addr.village ?? addr.hamlet,
        lat,
        lon,
        osmId: data.osm_id,
        type: data.type ?? '',
    };
    reverseCache.set(cacheKey, result);
    return result;
}
