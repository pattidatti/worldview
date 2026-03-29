import { type Webcam } from '@/types/webcam';
import { type Viewport } from '@/hooks/useViewport';

const WINDY_API = 'https://api.windy.com/webcams/api/v3/webcams';
const API_KEY = import.meta.env.VITE_WINDY_WEBCAMS_API_KEY || '';
const PER_PAGE = 50;
const MAX_PAGES = 4; // 200 kameraer maks

interface WindyWebcam {
    webcamId: string;
    title: string;
    status: string;
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
    const imgs = w.images.daylight ?? w.images.current;
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
    };
}

export async function fetchWebcams(viewport?: Viewport | null, signal?: AbortSignal): Promise<Webcam[]> {
    if (!API_KEY) return [];

    let baseUrl = `${WINDY_API}?include=images,location&limit=${PER_PAGE}`;

    if (viewport) {
        const centerLat = (viewport.north + viewport.south) / 2;
        const centerLon = (viewport.east + viewport.west) / 2;
        const radiusKm = Math.min(
            Math.max(Math.abs(viewport.north - viewport.south) * 111 / 2, 50),
            500
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

    return all;
}
