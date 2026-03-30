import { type Webcam } from '@/types/webcam';
import { type Viewport } from '@/hooks/useViewport';

const WINDY_API = 'https://api.windy.com/webcams/api/v3/webcams';
const API_KEY = import.meta.env.VITE_WINDY_WEBCAMS_API_KEY || '';
const PER_PAGE = 50;
const MAX_PAGES = 4; // 200 kameraer maks
const CACHE_TTL_MS = 9 * 60 * 1000; // 9 min (bilde-URLer utløper etter 10 min)
const SS_PREFIX = 'webcam:vp:';

interface WebcamCache {
    data: Webcam[];
    cachedAt: number;
}

function viewportCacheKey(viewport: Viewport | null | undefined): string {
    if (!viewport) return 'global';
    const r = (n: number) => Math.round(n * 2) / 2; // round to 0.5°
    return `${r(viewport.west)},${r(viewport.south)},${r(viewport.east)},${r(viewport.north)}`;
}

function loadWebcamCache(key: string): Webcam[] | null {
    try {
        const raw = sessionStorage.getItem(SS_PREFIX + key);
        if (!raw) return null;
        const entry: WebcamCache = JSON.parse(raw);
        if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
            sessionStorage.removeItem(SS_PREFIX + key);
            return null;
        }
        return entry.data;
    } catch {
        return null;
    }
}

function saveWebcamCache(key: string, data: Webcam[]): void {
    try {
        const entry: WebcamCache = { data, cachedAt: Date.now() };
        sessionStorage.setItem(SS_PREFIX + key, JSON.stringify(entry));
    } catch { /* quota exceeded — ignore */ }
}

interface WindyWebcam {
    webcamId: string;
    title: string;
    status: string;
    lastUpdatedOn?: string;
    images?: {
        current?: { preview?: string; thumbnail?: string };
        daylight?: { preview?: string; thumbnail?: string };
    };
    location?: {
        latitude: number;
        longitude: number;
        city?: string;
        country?: string;
    };
}

function parseWebcam(w: WindyWebcam): Webcam | null {
    if (!w.location || !w.images) return null;
    const imgs = w.images.current ?? w.images.daylight;
    const imageUrl = imgs?.preview ?? imgs?.thumbnail ?? '';
    if (!imageUrl) return null;
    return {
        id: String(w.webcamId),
        name: w.title,
        lat: w.location.latitude,
        lon: w.location.longitude,
        imageUrl,
        thumbnailUrl: imgs?.thumbnail ?? imageUrl,
        country: w.location.country ?? '',
        city: w.location.city ?? '',
        lastUpdated: w.lastUpdatedOn,
    };
}

export async function fetchWebcams(viewport?: Viewport | null, signal?: AbortSignal): Promise<Webcam[]> {
    if (!API_KEY) return [];

    const cacheKey = viewportCacheKey(viewport);
    const cached = loadWebcamCache(cacheKey);
    if (cached) return cached;

    let baseUrl = `${WINDY_API}?include=images,location&limit=${PER_PAGE}`;

    // Bare bruk nearby-filter når brukeren har zoomet inn (< 90° breddegrad-spenn).
    // Global visning (hele kloden) gir sentrum midt i Atlanterhavet → 0 treff.
    const latSpan = viewport ? Math.abs(viewport.north - viewport.south) : 180;
    if (viewport && latSpan < 90) {
        const centerLat = (viewport.north + viewport.south) / 2;
        const centerLon = (viewport.east + viewport.west) / 2;
        const radiusKm = Math.min(
            Math.max(latSpan * 111 / 2, 50),
            250
        );
        baseUrl += `&nearby=${centerLat},${centerLon},${Math.round(radiusKm)}`;
    }

    const all: Webcam[] = [];

    for (let page = 0; page < MAX_PAGES; page++) {
        const url = `${baseUrl}&offset=${page * PER_PAGE}`;
        const res = await fetch(url, {
            headers: { 'x-windy-api-key': API_KEY },
            signal,
        });

        if (!res.ok) break;

        const data = await res.json();
        const webcams: WindyWebcam[] = data?.webcams ?? [];

        for (const w of webcams) {
            const parsed = parseWebcam(w);
            if (parsed) all.push(parsed);
        }

        // Stop if we got fewer than a full page
        if (webcams.length < PER_PAGE) break;
    }

    saveWebcamCache(cacheKey, all);
    return all;
}
