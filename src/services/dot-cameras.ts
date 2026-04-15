import { type RoadCamera } from '@/types/roadCamera';
import { proxied } from '@/utils/corsProxy';

// Caltrans CWWP (California DOT) — free, no key, hundreds of highway cameras
const CALTRANS_URL = 'https://cwwp2.dot.ca.gov/api/hpevds/data.json';

// Convert DOT camera direction labels → degrees from North
function headingFromLabel(label: string): number | undefined {
    const u = label.toUpperCase();
    // Cardinal + intercardinal abbreviations used in US DOT names
    if (/\bNB\b/.test(u) || /NORTHBOUND/.test(u) || / N /.test(u) || /\bNORTH\b/.test(u)) return 0;
    if (/\bEB\b/.test(u) || /EASTBOUND/.test(u)  || / E /.test(u) || /\bEAST\b/.test(u))  return 90;
    if (/\bSB\b/.test(u) || /SOUTHBOUND/.test(u) || / S /.test(u) || /\bSOUTH\b/.test(u)) return 180;
    if (/\bWB\b/.test(u) || /WESTBOUND/.test(u)  || / W /.test(u) || /\bWEST\b/.test(u))  return 270;
    if (/\bNE\b/.test(u)) return 45;
    if (/\bSE\b/.test(u)) return 135;
    if (/\bSW\b/.test(u)) return 225;
    if (/\bNW\b/.test(u)) return 315;
    return undefined;
}

function parseEntry(d: unknown): RoadCamera | null {
    const e = d as Record<string, unknown>;

    // Caltrans CWWP response structure — defensive extraction
    const loc = (e.location ?? e.cctv_location ?? {}) as Record<string, unknown>;
    const lat =
        typeof loc.latitude === 'number'  ? loc.latitude  :
        typeof loc.lat      === 'number'  ? loc.lat       :
        typeof e.lat        === 'number'  ? e.lat         : null;
    const lon =
        typeof loc.longitude === 'number' ? loc.longitude :
        typeof loc.lng       === 'number' ? loc.lng       :
        typeof loc.lon       === 'number' ? loc.lon       :
        typeof e.lon         === 'number' ? e.lon         : null;

    if (lat === null || lon === null || !isFinite(lat as number) || !isFinite(lon as number)) return null;

    const name =
        String(e.name ?? e.title ?? e.description ?? e.cctv_description ?? e.id ?? '');

    // Try explicit bearing fields first, then parse from name
    const bearing =
        typeof e.bearing    === 'number' ? e.bearing    :
        typeof e.heading    === 'number' ? e.heading    :
        typeof e.direction  === 'number' ? e.direction  :
        typeof loc.bearing  === 'number' ? loc.bearing  :
        typeof e.direction  === 'string' ? (
            e.direction === 'N' ? 0 : e.direction === 'E' ? 90 :
            e.direction === 'S' ? 180 : e.direction === 'W' ? 270 : undefined
        ) :
        headingFromLabel(name);

    // Image URL — Caltrans uses nested imageData or cctv_image_url
    const imgData = (e.imageData ?? e.cctv_image_data ?? {}) as Record<string, unknown>;
    const imageUrl =
        typeof imgData.currentImageURL === 'string' ? imgData.currentImageURL :
        typeof imgData.imageUrl        === 'string' ? imgData.imageUrl        :
        typeof imgData.url             === 'string' ? imgData.url             :
        typeof e.imageUrl              === 'string' ? e.imageUrl              :
        typeof e.image_url             === 'string' ? e.image_url             :
        typeof e.url                   === 'string' ? e.url                   : '';

    const id = String(e.id ?? e.cameraId ?? e.camera_id ?? `${lat}-${lon}`);

    return {
        id,
        name: name || id,
        lat: lat as number,
        lon: lon as number,
        heading: bearing !== undefined ? ((bearing as number) + 360) % 360 : undefined,
        imageUrl,
        road: typeof e.highway === 'string' ? e.highway :
              typeof e.roadway === 'string' ? e.roadway :
              typeof e.road    === 'string' ? e.road    : undefined,
    };
}

export async function fetchDotCameras(): Promise<RoadCamera[]> {
    const res = await fetch(proxied(CALTRANS_URL));
    if (!res.ok) throw new Error(`Caltrans DOT kamera-feil: ${res.status}`);
    const json = await res.json();

    // Caltrans response is typically { data: [...] } or wrapped further
    const raw: unknown =
        Array.isArray(json)            ? json           :
        Array.isArray(json?.data)      ? json.data      :
        Array.isArray(json?.cameras)   ? json.cameras   :
        Array.isArray(json?.items)     ? json.items     : [];

    const cameras: RoadCamera[] = [];
    for (const entry of raw as unknown[]) {
        const cam = parseEntry(entry);
        if (cam) cameras.push(cam);
    }
    return cameras;
}
