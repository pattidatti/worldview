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

// Generic Overpass fetcher — used by all OSM feature layers
const _genericCache = new Map<string, any[]>();

export function overpassViewportKey05(vp: Viewport): string {
    // Round to 0.5 degrees — coarser cache for static features
    const r = (n: number) => Math.round(n * 2) / 2;
    return `${r(vp.south)},${r(vp.west)},${r(vp.north)},${r(vp.east)}`;
}

// ── localStorage persistence ────────────────────────────────────────────────

const LS_PREFIX = 'wv_ov:';
const LS_INDEX  = 'wv_ov_idx';
const MAX_LS_ENTRIES = 100;
const MAX_LS_ENTRY_BYTES = 200_000; // skip localStorage for very large responses

interface LsEntry { ts: number; data: any[] }

function lsGet(key: string, maxAgeMs: number): any[] | null {
    try {
        const raw = localStorage.getItem(LS_PREFIX + key);
        if (!raw) return null;
        const entry: LsEntry = JSON.parse(raw);
        if (Date.now() - entry.ts > maxAgeMs) {
            localStorage.removeItem(LS_PREFIX + key);
            return null;
        }
        return entry.data;
    } catch { return null; }
}

function lsSet(key: string, data: any[]): void {
    try {
        const serialized = JSON.stringify({ ts: Date.now(), data } satisfies LsEntry);
        if (serialized.length > MAX_LS_ENTRY_BYTES) return; // too large, skip

        let index: Record<string, number> = {};
        try { index = JSON.parse(localStorage.getItem(LS_INDEX) ?? '{}'); } catch {}

        // Evict oldest 20% when index is full
        const existingKeys = Object.keys(index);
        if (existingKeys.length >= MAX_LS_ENTRIES) {
            const toEvict = existingKeys
                .sort((a, b) => index[a] - index[b])
                .slice(0, Math.ceil(MAX_LS_ENTRIES * 0.2));
            for (const k of toEvict) {
                localStorage.removeItem(LS_PREFIX + k);
                delete index[k];
            }
        }

        localStorage.setItem(LS_PREFIX + key, serialized);
        index[key] = Date.now();
        localStorage.setItem(LS_INDEX, JSON.stringify(index));
    } catch { /* quota exceeded — in-memory cache still works */ }
}

// ── Fetch with two-layer cache ───────────────────────────────────────────────

export const DAY_MS = 86_400_000;

export async function fetchOverpassElements(
    query: string,
    cacheKey: string,
    maxAgeMs: number = 7 * DAY_MS,
): Promise<any[]> {
    // 1. In-memory (fastest, session-scoped)
    if (_genericCache.has(cacheKey)) return _genericCache.get(cacheKey)!;

    // 2. localStorage (survives page reload)
    const persisted = lsGet(cacheKey, maxAgeMs);
    if (persisted) {
        _genericCache.set(cacheKey, persisted);
        return persisted;
    }

    // 3. Overpass API
    try {
        const res = await fetch(ENDPOINT, {
            method: 'POST',
            body: `data=${encodeURIComponent(query)}`,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            signal: AbortSignal.timeout(32_000),
        });
        if (!res.ok) return [];
        const json = await res.json();
        const elements = json.elements ?? [];
        _genericCache.set(cacheKey, elements);
        lsSet(cacheKey, elements);
        return elements;
    } catch {
        return [];
    }
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
