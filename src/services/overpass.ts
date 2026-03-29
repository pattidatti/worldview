import { type Viewport } from '@/hooks/useViewport';
import {
    type OverpassPipeline,
    type OverpassPlatform,
    type OverpassWell,
    type OverpassInfrastructureData,
} from '@/types/infrastructure';

const ENDPOINT = 'https://overpass-api.de/api/interpreter';
const EMPTY: OverpassInfrastructureData = { pipelines: [], platforms: [], wells: [] };

// In-memory cache keyed by rounded viewport
let cachedKey = '';
let cachedData: OverpassInfrastructureData = EMPTY;

function viewportKey(vp: Viewport): string {
    // Round to 1 decimal — avoids re-fetch on small camera moves
    const r = (n: number) => Math.round(n * 10) / 10;
    return `${r(vp.south)},${r(vp.west)},${r(vp.north)},${r(vp.east)}`;
}

function buildQuery(vp: Viewport): string {
    const bbox = `${vp.south},${vp.west},${vp.north},${vp.east}`;
    return `[out:json][timeout:25];(way["man_made"="pipeline"]["substance"~"oil|gas|petroleum"](${bbox});node["man_made"="petroleum_well"](${bbox});node["man_made"="offshore_platform"](${bbox});way["man_made"="offshore_platform"](${bbox}););out geom;`;
}

function parseElements(elements: any[]): OverpassInfrastructureData {
    const pipelines: OverpassPipeline[] = [];
    const platforms: OverpassPlatform[] = [];
    const wells: OverpassWell[] = [];

    for (const el of elements) {
        const tags = el.tags ?? {};
        const manMade = tags.man_made ?? '';

        if (manMade === 'pipeline' && el.type === 'way' && el.geometry?.length >= 2) {
            pipelines.push({
                id: `osm-way-${el.id}`,
                name: tags.name ?? '',
                substance: tags.substance ?? '',
                operator: tags.operator ?? '',
                positions: el.geometry.map((g: any) => [Number(g.lon), Number(g.lat)]),
            });
        } else if (manMade === 'offshore_platform') {
            if (el.type === 'node') {
                platforms.push({
                    id: `osm-node-${el.id}`,
                    name: tags.name ?? '',
                    operator: tags.operator ?? '',
                    lat: Number(el.lat),
                    lon: Number(el.lon),
                });
            } else if (el.type === 'way' && el.geometry?.length) {
                // Use centroid of way geometry
                const lats = el.geometry.map((g: any) => Number(g.lat));
                const lons = el.geometry.map((g: any) => Number(g.lon));
                const avgLat = lats.reduce((a: number, b: number) => a + b, 0) / lats.length;
                const avgLon = lons.reduce((a: number, b: number) => a + b, 0) / lons.length;
                platforms.push({
                    id: `osm-way-${el.id}`,
                    name: tags.name ?? '',
                    operator: tags.operator ?? '',
                    lat: avgLat,
                    lon: avgLon,
                });
            }
        } else if (manMade === 'petroleum_well' && el.type === 'node') {
            wells.push({
                id: `osm-node-${el.id}`,
                name: tags.name ?? '',
                operator: tags.operator ?? '',
                lat: Number(el.lat),
                lon: Number(el.lon),
            });
        }
    }

    return { pipelines, platforms, wells };
}

export async function fetchOverpassInfrastructure(viewport: Viewport): Promise<OverpassInfrastructureData> {
    const key = viewportKey(viewport);
    if (key === cachedKey && cachedData !== EMPTY) return cachedData;

    try {
        const res = await fetch(ENDPOINT, {
            method: 'POST',
            body: `data=${encodeURIComponent(buildQuery(viewport))}`,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) return EMPTY;
        const json = await res.json();
        const result = parseElements(json.elements ?? []);
        cachedKey = key;
        cachedData = result;
        return result;
    } catch {
        return EMPTY;
    }
}
