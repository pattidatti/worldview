import { type TrafficEvent } from '@/types/traffic';
import { type Viewport } from '@/hooks/useViewport';

const API_KEY = import.meta.env.VITE_TOMTOM_API_KEY || '';
const BASE_URL = 'https://api.tomtom.com/traffic/services/5/incidentDetails';
const FIELDS = '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description},startTime,endTime,from,to,roadNumbers,delay,length}}}';
const MAX_AREA_KM2 = 10_000;

const CATEGORY_LABELS: Record<number, string> = {
    0: 'Ukjent',
    1: 'Ulykke',
    2: 'Tåke',
    3: 'Farlige forhold',
    4: 'Regn',
    5: 'Is',
    6: 'Kø',
    7: 'Felt stengt',
    8: 'Veg stengt',
    9: 'Veiarbeid',
    10: 'Vind',
    11: 'Flom',
    14: 'Havarert kjøretøy',
};

interface TomTomIncident {
    type: string;
    geometry: {
        type: 'Point' | 'LineString';
        coordinates: number[] | number[][];
    };
    properties: {
        id: string;
        iconCategory: number;
        magnitudeOfDelay: number;
        events?: { description: string }[];
        startTime?: string;
        endTime?: string | null;
        from?: string;
        to?: string;
        roadNumbers?: string[];
        delay?: number | null;
        length?: number;
    };
}

function mapSeverity(iconCategory: number, delay?: number | null): 'low' | 'medium' | 'high' {
    if (iconCategory === 8 || iconCategory === 1) return 'high';
    if ((delay && delay > 600) || iconCategory === 3 || iconCategory === 5) return 'high';
    if ((delay && delay > 120) || iconCategory === 9 || iconCategory === 7 || iconCategory === 6) return 'medium';
    return 'low';
}

function viewportAreaKm2(vp: Viewport): number {
    const midLat = (vp.north + vp.south) / 2;
    const kmPerDegLat = 111.0;
    const kmPerDegLon = 111.0 * Math.cos((midLat * Math.PI) / 180);
    const height = Math.abs(vp.north - vp.south) * kmPerDegLat;
    const width = Math.abs(vp.east - vp.west) * kmPerDegLon;
    return width * height;
}

function extractCoord(geometry: TomTomIncident['geometry']): [number, number] | null {
    if (geometry.type === 'Point') {
        const c = geometry.coordinates as number[];
        return c.length >= 2 ? [c[0], c[1]] : null;
    }
    // LineString — use midpoint for better placement
    const coords = geometry.coordinates as number[][];
    if (!coords.length) return null;
    const mid = coords[Math.floor(coords.length / 2)];
    return mid.length >= 2 ? [mid[0], mid[1]] : null;
}

export async function fetchTrafficEvents(
    viewport?: Viewport | null,
    signal?: AbortSignal,
): Promise<TrafficEvent[]> {
    if (!API_KEY || !viewport) return [];

    if (viewportAreaKm2(viewport) > MAX_AREA_KM2) return [];

    const bbox = `${viewport.west},${viewport.south},${viewport.east},${viewport.north}`;
    const url = `${BASE_URL}?key=${API_KEY}&bbox=${bbox}&fields=${encodeURIComponent(FIELDS)}&language=nb-NO&timeValidityFilter=present`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    if (signal) {
        signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) {
            if (res.status === 403 || res.status === 401) {
                throw new Error('Ugyldig TomTom API-nøkkel');
            }
            throw new Error(`TomTom API feil: ${res.status}`);
        }

        const data = await res.json();
        const incidents: TomTomIncident[] = data?.incidents ?? [];
        const events: TrafficEvent[] = [];

        for (const inc of incidents) {
            const coord = extractCoord(inc.geometry);
            if (!coord) continue;

            const props = inc.properties;
            const description = props.events?.[0]?.description
                || (props.from && props.to ? `${props.from} → ${props.to}` : '')
                || CATEGORY_LABELS[props.iconCategory]
                || 'Ukjent hendelse';

            const roadNumber = props.roadNumbers?.length
                ? props.roadNumbers.join(', ')
                : undefined;

            events.push({
                id: props.id,
                type: CATEGORY_LABELS[props.iconCategory] ?? 'Ukjent',
                description,
                lat: coord[1],
                lon: coord[0],
                severity: mapSeverity(props.iconCategory, props.delay),
                startTime: props.startTime ?? '',
                endTime: props.endTime ?? undefined,
                roadNumber,
                category: props.iconCategory,
            });
        }

        return events;
    } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        throw err;
    }
}
