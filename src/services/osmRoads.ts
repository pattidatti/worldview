import { fetchOverpassElements, type OverpassElement } from './overpass';
import { type Viewport } from '@/hooks/useViewport';
import { type RoadSegment } from '@/types/simulatedTraffic';

// 'residential' excluded: too many segments over city areas, causes Overpass timeouts
const ROAD_TYPES = 'primary|secondary|tertiary';
const CACHE_TTL_MS = 10 * 60_000; // 10 minutes
const MAX_VIEWPORT_KM2 = 5_000; // skip if viewport > 5 000 km² (too large for useful results)

function viewportAreaKm2(vp: Viewport): number {
    const midLat = (vp.north + vp.south) / 2;
    const kmPerDegLat = 111.0;
    const kmPerDegLon = 111.0 * Math.cos((midLat * Math.PI) / 180);
    const h = Math.abs(vp.north - vp.south) * kmPerDegLat;
    const w = Math.abs(vp.east - vp.west) * kmPerDegLon;
    return h * w;
}

function roadViewportKey(vp: Viewport): string {
    // 0.2° grid — finer than 0.5° used for static infrastructure
    const r = (n: number) => Math.round(n * 5) / 5;
    return `roads:${r(vp.south)},${r(vp.west)},${r(vp.north)},${r(vp.east)}`;
}

function haversineM(lon1: number, lat1: number, lon2: number, lat2: number): number {
    const R = 6_371_000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildSegmentGeometry(positions: [number, number][]): {
    legLengths: number[];
    legHeadings: number[];
    totalLength: number;
} {
    const legLengths: number[] = [];
    const legHeadings: number[] = [];
    let totalLength = 0;

    for (let i = 0; i < positions.length - 1; i++) {
        const [lon1, lat1] = positions[i];
        const [lon2, lat2] = positions[i + 1];
        const len = haversineM(lon1, lat1, lon2, lat2);
        legLengths.push(Math.max(len, 0.1)); // guard against degenerate nodes
        totalLength += len;

        const lat1Rad = (lat1 * Math.PI) / 180;
        const lat2Rad = (lat2 * Math.PI) / 180;
        const dLonRad = ((lon2 - lon1) * Math.PI) / 180;
        const y = Math.sin(dLonRad) * Math.cos(lat2Rad);
        const x =
            Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLonRad);
        const bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
        legHeadings.push(bearing);
    }

    return { legLengths, legHeadings, totalLength };
}

function parseRoadSegment(el: OverpassElement): RoadSegment | null {
    if (!el.geometry || el.geometry.length < 2) return null;
    // OverpassGeomPoint has lat/lon as strings
    const positions: [number, number][] = el.geometry.map((g) => [Number(g.lon), Number(g.lat)]);
    const { legLengths, legHeadings, totalLength } = buildSegmentGeometry(positions);
    const tags = el.tags ?? {};

    return {
        id: `osm-way-${el.id}`,
        positions,
        name: tags.name ?? '',
        highway: tags.highway ?? 'residential',
        lengthM: totalLength,
        legLengths,
        legHeadings,
    };
}

export async function fetchRoadSegments(viewport: Viewport): Promise<RoadSegment[]> {
    if (viewportAreaKm2(viewport) > MAX_VIEWPORT_KM2) return [];

    const key = roadViewportKey(viewport);
    const bbox = `${viewport.south},${viewport.west},${viewport.north},${viewport.east}`;
    const query = `[out:json][timeout:25];way["highway"~"${ROAD_TYPES}"](${bbox});out geom;`;

    const elements = await fetchOverpassElements(query, key, CACHE_TTL_MS);

    return elements
        .filter((el) => el.type === 'way' && (el.geometry?.length ?? 0) >= 2)
        .map(parseRoadSegment)
        .filter((seg): seg is RoadSegment => seg !== null && seg.lengthM >= 200);
}
