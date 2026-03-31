import { type Earthquake } from '@/types/earthquake';

// M2.5+ earthquakes from the last 24 hours
const USGS_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';

export async function fetchEarthquakes(): Promise<Earthquake[]> {
    const response = await fetch(USGS_URL);
    if (!response.ok) throw new Error(`USGS feil: ${response.status}`);
    const data = await response.json();
    return data.features.map((f: { id: string; properties: { title: string; mag: number; place: string; time: number; url: string }; geometry: { coordinates: [number, number, number] } }): Earthquake => ({
        id: f.id,
        title: f.properties.title,
        magnitude: f.properties.mag ?? 0,
        place: f.properties.place ?? '',
        time: f.properties.time,
        url: f.properties.url,
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        depth: f.geometry.coordinates[2],
    })).filter(eq => Number.isFinite(eq.lat) && Number.isFinite(eq.lon));
}
