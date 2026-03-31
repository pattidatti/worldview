import { type Viewport } from '@/hooks/useViewport';
import { fetchOverpassElements, overpassViewportKey05, DAY_MS, type OverpassGeomPoint } from './overpass';
import {
    type PowerData,
    type WindData,
    type HarborData,
    type LighthouseData,
    type TelecomData,
    type MineData,
    type OsmPoint,
    type OsmWay,
} from '@/types/osmFeatures';

function centroid(geometry: { lat: string; lon: string }[]): { lat: number; lon: number } {
    const lats = geometry.map((g) => Number(g.lat));
    const lons = geometry.map((g) => Number(g.lon));
    return {
        lat: lats.reduce((a, b) => a + b, 0) / lats.length,
        lon: lons.reduce((a, b) => a + b, 0) / lons.length,
    };
}

// Use rounded bbox so the query bbox matches the cache key — avoids partial coverage bugs
function bbox(vp: Viewport): string {
    const r = (n: number) => Math.round(n * 2) / 2;
    return `${r(vp.south)},${r(vp.west)},${r(vp.north)},${r(vp.east)}`;
}

// ── Power infrastructure ────────────────────────────────────────────────────

export async function fetchPowerData(viewport: Viewport): Promise<PowerData> {
    const bb = bbox(viewport);
    const query = `[out:json][timeout:30];(way["power"="line"](${bb});node["power"="substation"](${bb});way["power"="substation"](${bb});node["power"="plant"](${bb});way["power"="plant"](${bb}););out geom;`;
    const key = `power:${overpassViewportKey05(viewport)}`;
    const elements = await fetchOverpassElements(query, key, 7 * DAY_MS);

    const lines: OsmWay[] = [];
    const substations: OsmPoint[] = [];
    const plants: OsmPoint[] = [];

    for (const el of elements) {
        const tags: Record<string, string> = el.tags ?? {};
        const power = tags.power ?? '';

        if (power === 'line' && el.type === 'way' && (el.geometry?.length ?? 0) >= 2) {
            lines.push({
                id: `power-way-${el.id}`,
                name: tags.name ?? '',
                tags,
                positions: el.geometry!.map((g: OverpassGeomPoint) => [Number(g.lon), Number(g.lat)] as [number, number]),
            });
        } else if (power === 'substation') {
            if (el.type === 'node') {
                substations.push({ id: `power-node-${el.id}`, lat: Number(el.lat), lon: Number(el.lon), name: tags.name ?? '', tags });
            } else if (el.type === 'way' && el.geometry?.length) {
                const c = centroid(el.geometry);
                substations.push({ id: `power-way-${el.id}`, lat: c.lat, lon: c.lon, name: tags.name ?? '', tags });
            }
        } else if (power === 'plant') {
            if (el.type === 'node') {
                plants.push({ id: `power-node-${el.id}`, lat: Number(el.lat), lon: Number(el.lon), name: tags.name ?? '', tags });
            } else if (el.type === 'way' && el.geometry?.length) {
                const c = centroid(el.geometry);
                plants.push({ id: `power-way-${el.id}`, lat: c.lat, lon: c.lon, name: tags.name ?? '', tags });
            }
        }
    }

    return { lines, substations, plants };
}

// ── Wind turbines ───────────────────────────────────────────────────────────

export async function fetchWindData(viewport: Viewport): Promise<WindData> {
    const bb = bbox(viewport);
    const query = `[out:json][timeout:25];(node["power"="generator"]["generator:source"="wind"](${bb});node["generator:source"="wind"](${bb}););out body;`;
    const key = `wind:${overpassViewportKey05(viewport)}`;
    const elements = await fetchOverpassElements(query, key, 7 * DAY_MS);

    const seen = new Set<string>();
    const turbines: OsmPoint[] = [];

    for (const el of elements) {
        if (el.type !== 'node') continue;
        const id = `wind-node-${el.id}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const tags: Record<string, string> = el.tags ?? {};
        turbines.push({ id, lat: Number(el.lat), lon: Number(el.lon), name: tags.name ?? '', tags });
    }

    return { turbines };
}

// ── Harbors and piers ───────────────────────────────────────────────────────

export async function fetchHarborData(viewport: Viewport): Promise<HarborData> {
    const bb = bbox(viewport);
    const query = `[out:json][timeout:25];(node["harbour"="yes"](${bb});node["amenity"="ferry_terminal"](${bb});node["man_made"="pier"](${bb});way["man_made"="pier"](${bb}););out geom;`;
    const key = `harbors:${overpassViewportKey05(viewport)}`;
    const elements = await fetchOverpassElements(query, key, 14 * DAY_MS);

    const terminals: OsmPoint[] = [];
    const piers: OsmWay[] = [];

    for (const el of elements) {
        const tags: Record<string, string> = el.tags ?? {};

        if (el.type === 'node') {
            terminals.push({ id: `harbor-node-${el.id}`, lat: Number(el.lat), lon: Number(el.lon), name: tags.name ?? '', tags });
        } else if (el.type === 'way' && (el.geometry?.length ?? 0) >= 2) {
            piers.push({
                id: `harbor-way-${el.id}`,
                name: tags.name ?? '',
                tags,
                positions: el.geometry!.map((g: OverpassGeomPoint) => [Number(g.lon), Number(g.lat)] as [number, number]),
            });
        }
    }

    return { terminals, piers };
}

// ── Lighthouses ─────────────────────────────────────────────────────────────

export async function fetchLighthouseData(viewport: Viewport): Promise<LighthouseData> {
    const bb = bbox(viewport);
    const query = `[out:json][timeout:20];(node["man_made"="lighthouse"](${bb});way["man_made"="lighthouse"](${bb}););out geom;`;
    const key = `lighthouses:${overpassViewportKey05(viewport)}`;
    const elements = await fetchOverpassElements(query, key, 30 * DAY_MS);

    const lighthouses: OsmPoint[] = [];

    for (const el of elements) {
        const tags: Record<string, string> = el.tags ?? {};
        if (el.type === 'node') {
            lighthouses.push({ id: `lh-node-${el.id}`, lat: Number(el.lat), lon: Number(el.lon), name: tags.name ?? '', tags });
        } else if (el.type === 'way' && el.geometry?.length) {
            const c = centroid(el.geometry);
            lighthouses.push({ id: `lh-way-${el.id}`, lat: c.lat, lon: c.lon, name: tags.name ?? '', tags });
        }
    }

    return { lighthouses };
}

// ── Telecom towers ──────────────────────────────────────────────────────────

export async function fetchTelecomData(viewport: Viewport): Promise<TelecomData> {
    const bb = bbox(viewport);
    const query = `[out:json][timeout:25];(node["tower:type"="communication"](${bb});node["man_made"="communication_tower"](${bb}););out body;`;
    const key = `telecom:${overpassViewportKey05(viewport)}`;
    const elements = await fetchOverpassElements(query, key, 14 * DAY_MS);

    const seen = new Set<string>();
    const towers: OsmPoint[] = [];

    for (const el of elements) {
        if (el.type !== 'node') continue;
        const id = `telecom-node-${el.id}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const tags: Record<string, string> = el.tags ?? {};
        towers.push({ id, lat: Number(el.lat), lon: Number(el.lon), name: tags.name ?? '', tags });
    }

    return { towers };
}

// ── Mines and quarries ──────────────────────────────────────────────────────

export async function fetchMineData(viewport: Viewport): Promise<MineData> {
    const bb = bbox(viewport);
    const query = `[out:json][timeout:25];(node["man_made"="mineshaft"](${bb});node["man_made"="adit"](${bb});node["industrial"="mine"](${bb});way["landuse"="quarry"](${bb}););out geom;`;
    const key = `mines:${overpassViewportKey05(viewport)}`;
    const elements = await fetchOverpassElements(query, key, 30 * DAY_MS);

    const mines: OsmPoint[] = [];
    const quarryCentroids: OsmPoint[] = [];

    for (const el of elements) {
        const tags: Record<string, string> = el.tags ?? {};
        if (el.type === 'node') {
            mines.push({ id: `mine-node-${el.id}`, lat: Number(el.lat), lon: Number(el.lon), name: tags.name ?? '', tags });
        } else if (el.type === 'way' && el.geometry?.length) {
            const c = centroid(el.geometry);
            quarryCentroids.push({ id: `mine-way-${el.id}`, lat: c.lat, lon: c.lon, name: tags.name ?? tags.landuse ?? '', tags });
        }
    }

    return { mines, quarryCentroids };
}
