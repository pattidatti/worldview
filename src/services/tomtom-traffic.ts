import { type TrafficEvent } from '@/types/traffic';
import { type Viewport } from '@/hooks/useViewport';

const API_KEY = import.meta.env.VITE_TOMTOM_API_KEY || '';
const BASE_URL = 'https://api.tomtom.com/traffic/services/5/incidentDetails';

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

interface TomTomPoi {
    id: string;
    p: { x: number; y: number };
    ic: number;    // iconCategory
    ty: number;    // 0=cluster, 1=incident
    d?: string;    // description
    c?: string;    // cause
    f?: string;    // from
    t?: string;    // to
    dl?: number;   // delay seconds
    l?: number;    // length meters
    r?: string;    // road number
    sd?: string;   // start date
    ed?: string;   // end date
}

function mapSeverity(iconCategory: number, delay?: number): 'low' | 'medium' | 'high' {
    // Road closures and accidents are high severity
    if (iconCategory === 8 || iconCategory === 1) return 'high';
    // Significant delay (> 10 min) or dangerous categories
    if ((delay && delay > 600) || iconCategory === 3 || iconCategory === 5) return 'high';
    // Moderate delay (> 2 min) or road works / lane closures
    if ((delay && delay > 120) || iconCategory === 9 || iconCategory === 7 || iconCategory === 6) return 'medium';
    return 'low';
}

function estimateZoom(viewport: Viewport): number {
    const latSpan = Math.abs(viewport.north - viewport.south);
    const zoom = Math.round(Math.log2(360 / latSpan));
    return Math.max(5, Math.min(zoom, 18));
}

export async function fetchTrafficEvents(
    viewport?: Viewport | null,
    signal?: AbortSignal,
): Promise<TrafficEvent[]> {
    if (!API_KEY || !viewport) return [];

    // Skip fetch when zoomed out too far — incidents aren't useful at that scale
    const latSpan = Math.abs(viewport.north - viewport.south);
    if (latSpan > 30) return [];

    const zoom = estimateZoom(viewport);
    const bbox = `${viewport.south},${viewport.west},${viewport.north},${viewport.east}`;

    const url = `${BASE_URL}/s3/${bbox}/${zoom}/-1?key=${API_KEY}&language=nb-NO&categoryFilter=0,1,2,3,4,5,6,7,8,9,10,11,12,13,14&timeValidityFilter=present&originalPosition=true`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    // Chain caller signal to our timeout controller
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
        const pois: TomTomPoi[] = data?.tm?.poi ?? [];
        const events: TrafficEvent[] = [];

        for (const poi of pois) {
            // Skip clusters, only show individual incidents
            if (poi.ty === 0) continue;
            if (!poi.p?.x || !poi.p?.y) continue;

            const description = poi.d || poi.c || CATEGORY_LABELS[poi.ic] || 'Ukjent hendelse';
            const type = CATEGORY_LABELS[poi.ic] ?? 'Ukjent';

            events.push({
                id: poi.id,
                type,
                description,
                lat: poi.p.y,
                lon: poi.p.x,
                severity: mapSeverity(poi.ic, poi.dl),
                startTime: poi.sd ?? '',
                endTime: poi.ed,
                roadNumber: poi.r,
                category: poi.ic,
            });
        }

        return events;
    } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        throw err;
    }
}
