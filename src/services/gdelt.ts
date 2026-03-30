import { type NewsEvent } from '@/types/news';

const GDELT_URL =
    'https://api.gdeltproject.org/api/v2/geo/geo?query=*&mode=PointData&format=GeoJSON&timespan=60min';

const MAX_RESULTS = 2000;

export async function fetchNewsEvents(): Promise<NewsEvent[]> {
    const response = await fetch(GDELT_URL);
    if (!response.ok) throw new Error(`GDELT feil: ${response.status}`);

    const json = await response.json();
    const features: unknown[] = json?.features ?? [];

    const events: NewsEvent[] = [];
    for (const f of features) {
        const feat = f as {
            geometry?: { coordinates?: [number, number] };
            properties?: {
                name?: string;
                url?: string;
                domain?: string;
                shareimage?: string;
                language?: string;
                tone?: number;
            };
        };
        const coords = feat.geometry?.coordinates;
        const props = feat.properties;
        if (!coords || !props?.name || !props?.url) continue;

        const [lon, lat] = coords;
        events.push({
            id: `${lon.toFixed(3)}_${lat.toFixed(3)}_${btoa(props.url.slice(-40)).slice(0, 12)}`,
            title: props.name,
            url: props.url,
            domain: props.domain ?? '',
            imageUrl: props.shareimage ?? '',
            language: props.language ?? '',
            tone: props.tone ?? 0,
            lat,
            lon,
        });

        if (events.length >= MAX_RESULTS) break;
    }
    return events;
}
