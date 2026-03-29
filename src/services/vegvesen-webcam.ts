import { type Webcam } from '@/types/webcam';

const DATEX_URL =
    'https://datex.vegvesen.no/datafangst/nettinnhold/webkamera/webkamera-oversikt.json';

interface VegvesenCamera {
    id: string;
    navn: string;
    sted: string;
    fylke: string;
    lat: number;
    lon: number;
    bildeUrl: string;
}

export async function fetchWebcams(): Promise<Webcam[]> {
    const res = await fetch(DATEX_URL);
    if (!res.ok) throw new Error(`Vegvesenet webkamera feil: ${res.status}`);

    const data: VegvesenCamera[] = await res.json();

    return data
        .filter((c) => c.lat && c.lon && c.bildeUrl)
        .map((c) => ({
            id: c.id,
            name: c.navn || c.sted || 'Ukjent kamera',
            lat: c.lat,
            lon: c.lon,
            imageUrl: c.bildeUrl,
            county: c.fylke || '',
        }));
}
