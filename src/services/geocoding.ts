export interface GeoResult {
    name: string;
    lat: number;
    lon: number;
    type: string;
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

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
    return data.map((r: { display_name: string; lat: string; lon: string; type: string }) => ({
        name: r.display_name,
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
        type: r.type,
    }));
}
