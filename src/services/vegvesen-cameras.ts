import { type RoadCamera } from '@/types/roadCamera';

// Vegvesen webkamera-portal public API
// Bilde-URLer: https://webkamera.atlas.vegvesen.no/public/{id}/mjpeg_master.jpg
const API_URL = 'https://webkamera.atlas.vegvesen.no/public/cameras';
const IMAGE_BASE = 'https://webkamera.atlas.vegvesen.no/public';

function parseEntry(d: unknown): RoadCamera | null {
    const e = d as Record<string, unknown>;

    // Flexible lat/lon extraction (various field name patterns)
    const lat =
        typeof e.lat === 'number' ? e.lat :
        typeof e.latitude === 'number' ? e.latitude :
        typeof (e.location as Record<string, unknown>)?.latitude === 'number'
            ? (e.location as Record<string, unknown>).latitude as number : null;
    const lon =
        typeof e.lon === 'number' ? e.lon :
        typeof e.lng === 'number' ? e.lng :
        typeof e.longitude === 'number' ? e.longitude :
        typeof (e.location as Record<string, unknown>)?.longitude === 'number'
            ? (e.location as Record<string, unknown>).longitude as number : null;

    if (lat === null || lon === null || !isFinite(lat as number) || !isFinite(lon as number)) return null;

    // Camera heading/bearing — multiple possible field names
    const heading =
        typeof e.bearing === 'number' ? e.bearing :
        typeof e.heading === 'number' ? e.heading :
        typeof e.direction === 'number' ? e.direction :
        typeof (e.location as Record<string, unknown>)?.bearing === 'number'
            ? (e.location as Record<string, unknown>).bearing as number : undefined;

    const id = String(e.id ?? e.cameraId ?? '');
    if (!id) return null;

    const imageUrl =
        typeof e.imageUrl === 'string' ? e.imageUrl :
        typeof e.image === 'string' ? e.image :
        typeof e.stillUrl === 'string' ? e.stillUrl :
        `${IMAGE_BASE}/${id}/mjpeg_master.jpg`;

    return {
        id,
        name: String(e.name ?? e.title ?? e.description ?? id),
        lat: lat as number,
        lon: lon as number,
        heading: heading !== undefined ? (heading as number + 360) % 360 : undefined,
        imageUrl,
        road: typeof e.road === 'string' ? e.road :
              typeof e.roadCategory === 'string' ? e.roadCategory : undefined,
    };
}

export async function fetchVegvesenCameras(): Promise<RoadCamera[]> {
    const res = await fetch(API_URL, {
        headers: { 'User-Agent': 'WorldView/1.0 (vegvesen-cameras)' },
    });
    if (!res.ok) throw new Error(`Vegvesen-kamera feil: ${res.status}`);
    const json = await res.json();

    // Handle both array and wrapped formats
    const arr: unknown[] = Array.isArray(json) ? json :
                           Array.isArray(json?.cameras) ? json.cameras :
                           Array.isArray(json?.cctv) ? json.cctv : [];

    const cameras: RoadCamera[] = [];
    for (const entry of arr) {
        const cam = parseEntry(entry);
        if (cam) cameras.push(cam);
    }
    return cameras;
}
