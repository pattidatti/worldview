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

export async function geocode(query: string): Promise<GeoResult[]> {
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
    return data.map((r: { display_name: string; lat: string; lon: string; type: string; boundingbox: string[] }) => ({
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
}

export async function reverseGeocode(lat: number, lon: number): Promise<ReverseGeoResult | null> {
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

    if (!res.ok) return null;

    const data = await res.json();
    if (data.error) return null;

    const addr = data.address ?? {};
    return {
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
}
