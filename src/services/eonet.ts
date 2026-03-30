import { type Disaster } from '@/types/disaster';

const EONET_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=200';

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

export async function fetchDisasters(): Promise<Disaster[]> {
    const response = await fetch(EONET_URL);
    if (!response.ok) throw new Error(`EONET feil: ${response.status}`);
    const data = await response.json() as { events: EonetEvent[] };

    const results: Disaster[] = [];
    for (const event of data.events) {
        const category = event.categories[0]?.title ?? 'Ukjent';
        // Skip earthquakes — we have USGS for that
        if (category === 'Earthquakes') continue;

        // Use the latest geometry point
        const geo = event.geometry[event.geometry.length - 1];
        if (!geo) continue;

        let lon: number, lat: number;
        // Point: coordinates = [lon, lat]
        // Polygon: coordinates = [[lon, lat], ...]
        if (Array.isArray(geo.coordinates[0])) {
            const first = (geo.coordinates as number[][])[0];
            lon = first[0];
            lat = first[1];
        } else {
            const coords = geo.coordinates as number[];
            lon = coords[0];
            lat = coords[1];
        }

        if (lon == null || lat == null) continue;

        results.push({
            id: event.id,
            title: event.title,
            category,
            lon,
            lat,
            date: geo.date,
            url: event.link,
        });
    }
    return results;
}
