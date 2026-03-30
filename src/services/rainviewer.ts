import { type RainViewerMaps } from '@/types/weatherRadar';

const API_URL = 'https://api.rainviewer.com/public/weather-maps.json';

export async function fetchRadarTimestamps(): Promise<RainViewerMaps> {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error(`RainViewer feil: ${response.status}`);
    return response.json();
}

export function radarTileUrl(host: string, path: string): string {
    return `${host}${path}/256/{z}/{x}/{y}/2/1_1.png`;
}
