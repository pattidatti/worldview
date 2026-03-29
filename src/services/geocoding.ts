export interface GeoResult {
    name: string;
    lat: number;
    lon: number;
    type: string;
    boundingbox: [number, number, number, number]; // [south, north, west, east]
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
