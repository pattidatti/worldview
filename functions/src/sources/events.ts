// Events: disasters (EONET) + news (GDELT). ACLED er valgfri — hoppes over
// hvis nøkler ikke er satt. Alle er globale i API-et, ingen viewport-filtrering.

export interface SnapshotDisaster {
    id: string;
    title: string;
    category: string;
    lon: number;
    lat: number;
    date: string;
    url: string;
}

export interface SnapshotNewsEvent {
    id: string;
    title: string;
    url: string;
    tone: number;
    lat: number;
    lon: number;
    ts: number;
}

interface EonetGeometry {
    date: string;
    type: string;
    coordinates: number[] | number[][];
}

interface EonetEvent {
    id: string;
    title: string;
    link: string;
    categories: { id: string; title: string }[];
    geometry: EonetGeometry[];
}

export async function fetchDisasters(): Promise<SnapshotDisaster[]> {
    try {
        const res = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=200');
        if (!res.ok) {
            console.warn(`[disasters] fetch feilet ${res.status}`);
            return [];
        }
        const data = await res.json() as { events: EonetEvent[] };
        const out: SnapshotDisaster[] = [];
        for (const ev of data.events) {
            const category = ev.categories[0]?.title ?? 'Ukjent';
            if (category === 'Earthquakes') continue;
            const geo = ev.geometry[ev.geometry.length - 1];
            if (!geo) continue;
            let lon: number, lat: number;
            if (Array.isArray(geo.coordinates[0])) {
                const first = (geo.coordinates as number[][])[0];
                lon = first[0]; lat = first[1];
            } else {
                const coords = geo.coordinates as number[];
                lon = coords[0]; lat = coords[1];
            }
            if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
            out.push({
                id: ev.id,
                title: ev.title,
                category,
                lon, lat,
                date: geo.date,
                url: ev.link,
            });
        }
        return out;
    } catch (e) {
        console.warn('[disasters] exception', e);
        return [];
    }
}

// GDELT GeoJSON — siste 60 min geolokaliserte nyheter.
export async function fetchNews(): Promise<SnapshotNewsEvent[]> {
    try {
        const res = await fetch('https://api.gdeltproject.org/api/v2/geo/geo?query=&mode=PointData&format=geojson');
        if (!res.ok) {
            console.warn(`[news] fetch feilet ${res.status}`);
            return [];
        }
        const data = await res.json() as {
            features?: Array<{
                geometry?: { coordinates: [number, number] };
                properties?: { name?: string; html?: string; shareimage?: string; count?: number };
            }>;
        };
        const out: SnapshotNewsEvent[] = [];
        const now = Date.now();
        for (const f of data.features ?? []) {
            const coords = f.geometry?.coordinates;
            if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) continue;
            const p = f.properties ?? {};
            const title = (p.name ?? '').slice(0, 200);
            if (!title) continue;
            out.push({
                id: `${coords[0].toFixed(3)}_${coords[1].toFixed(3)}_${title.slice(0, 40)}`,
                title,
                url: p.html ?? '',
                tone: 0,
                lat: coords[1],
                lon: coords[0],
                ts: now,
            });
        }
        return out.slice(0, 2000);
    } catch (e) {
        console.warn('[news] exception', e);
        return [];
    }
}
