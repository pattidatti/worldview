import { type VolcanoEvent, type VolcanoAlertLevel } from '@/types/volcano';
import { cachedFetch } from './firestoreCache';

const USGS_RSS = 'https://volcanoes.usgs.gov/vsc/rss/voanotice.xml';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 time — vulkanvarsler endrer seg sakte

// Statisk koordinat-lookup for de vanligste USGS-vulkanene
// Brukes som fallback hvis RSS-feeden ikke inneholder geo-tags
const VOLCANO_COORDS: Record<string, [number, number]> = {
    'Kilauea':        [19.421, -155.287],
    'Mauna Loa':      [19.475, -155.608],
    'Redoubt':        [60.485, -152.743],
    'Augustine':      [59.363, -153.430],
    'Shishaldin':     [54.756, -163.970],
    'Cleveland':      [52.825, -169.944],
    'Veniaminof':     [56.196, -159.385],
    'Spurr':          [61.299, -152.251],
    'Akutan':         [54.133, -165.986],
    'Makushin':       [53.891, -166.923],
    'Pavlof':         [55.418, -161.894],
    'Great Sitkin':   [52.077, -176.130],
    'Semisopochnoi':  [51.930,  179.597],
    'Iliamna':        [60.032, -153.090],
    'Popocatepetl':   [19.023,  -98.622],
    'Fuego':          [14.473,  -90.880],
    'Soufriere Hills':[16.716,  -62.177],
    'Piton de la Fournaise': [-21.244, 55.708],
    'Etna':           [37.748,   14.999],
    'Stromboli':      [38.789,   15.213],
    'Sakurajima':     [31.581,  130.659],
    'Merapi':         [-7.542,  110.446],
    'Sinabung':       [ 3.170,   98.392],
    'Krakatau':       [-6.102,  105.423],
};

function parseAlertLevel(text: string): VolcanoAlertLevel {
    const t = text.toLowerCase();
    if (t.includes('warning')) return 'warning';
    if (t.includes('watch')) return 'watch';
    if (t.includes('advisory')) return 'advisory';
    if (t.includes('normal')) return 'normal';
    return 'unassigned';
}

function findCoords(title: string): [number, number] | null {
    for (const [name, coords] of Object.entries(VOLCANO_COORDS)) {
        if (title.toLowerCase().includes(name.toLowerCase())) return coords;
    }
    return null;
}

export function fetchVolcanoes(): Promise<VolcanoEvent[]> {
    // Globalt-identisk feed → delt cache (alle brukere deler én fetch/time).
    return cachedFetch('volcanoes:v1', CACHE_TTL_MS, fetchVolcanoesLive);
}

async function fetchVolcanoesLive(): Promise<VolcanoEvent[]> {
    const res = await fetch(USGS_RSS, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`USGS vulkaner: ${res.status}`);
    const xml = await res.text();
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const items = Array.from(doc.querySelectorAll('item'));

    const results: VolcanoEvent[] = [];
    for (const item of items) {
        const title = item.querySelector('title')?.textContent?.trim() ?? '';
        const description = item.querySelector('description')?.textContent?.trim() ?? '';
        const link = item.querySelector('link')?.textContent?.trim() ?? '';
        const pubDateStr = item.querySelector('pubDate')?.textContent?.trim() ?? '';

        // Prøv geo-namespace
        const geoLat = item.querySelector('geo\\:lat, lat')?.textContent;
        const geoLon = item.querySelector('geo\\:long, long, geo\\:lon, lon')?.textContent;

        let lat: number | null = null;
        let lon: number | null = null;

        if (geoLat && geoLon) {
            lat = parseFloat(geoLat);
            lon = parseFloat(geoLon);
        }

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            const fallback = findCoords(title);
            if (!fallback) continue;
            [lat, lon] = fallback;
        }

        const id = link || `volcano-${title}-${pubDateStr}`;
        results.push({
            id,
            name: title.replace(/:\s*(normal|advisory|watch|warning).*/i, '').trim(),
            lat: lat!,
            lon: lon!,
            alertLevel: parseAlertLevel(title + ' ' + description),
            description,
            publishedAt: pubDateStr ? new Date(pubDateStr).getTime() : Date.now(),
            url: link,
        });
    }
    return results;
}
