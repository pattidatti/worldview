import { pointInPolygon, pointInMultiPolygon } from './pointInPolygon';

export interface CountryFeature {
    name: string;
    iso2: string;
    iso3: string;
    continent: string;
    region: string;
    subregion: string;
    population: number;
    gdpMd: number;
    bbox: { west: number; south: number; east: number; north: number };
    center: { lat: number; lon: number };
    radiusNm: number;
}

interface RawFeature {
    type: string;
    properties: Record<string, unknown>;
    geometry: {
        type: string;
        coordinates: unknown;
    };
}

let cachedFeatures: { feature: CountryFeature; raw: RawFeature }[] | null = null;

async function loadFeatures(): Promise<{ feature: CountryFeature; raw: RawFeature }[]> {
    if (cachedFeatures) return cachedFeatures;
    const res = await fetch('/data/countries.geojson');
    if (!res.ok) throw new Error(`GeoJSON fetch feil: ${res.status}`);
    const json = await res.json() as { features: RawFeature[] };

    cachedFeatures = json.features.map((raw) => {
        const p = raw.properties;
        const name = String(p.NAME ?? p.ADMIN ?? '');
        const rawIso2 = String(p.ISO_A2 ?? '');
        const iso2 = rawIso2 === '-99' ? String(p.ISO_A2_EH ?? p.ADM0_A3 ?? '').slice(0, 2) : rawIso2;
        const rawIso3 = String(p.ISO_A3 ?? '');
        const iso3 = rawIso3 === '-99' ? String(p.ADM0_A3 ?? p.GU_A3 ?? '') : rawIso3;

        let west = 180, south = 90, east = -180, north = -90;
        const coords = raw.geometry.type === 'MultiPolygon'
            ? (raw.geometry.coordinates as number[][][][]).flat(2)
            : (raw.geometry.coordinates as number[][][]).flat(1);
        for (const [lon, lat] of coords) {
            if (lon < west) west = lon;
            if (lon > east) east = lon;
            if (lat < south) south = lat;
            if (lat > north) north = lat;
        }

        const centerLat = (south + north) / 2;
        const centerLon = (west + east) / 2;
        const latSpanNm = (north - south) * 60;
        const lonSpanNm = (east - west) * 60 * Math.cos((centerLat * Math.PI) / 180);
        const radiusNm = Math.min(250, Math.ceil(Math.sqrt(latSpanNm ** 2 + lonSpanNm ** 2) / 2) + 20);

        return {
            raw,
            feature: {
                name,
                iso2,
                iso3,
                continent: String(p.CONTINENT ?? ''),
                region: String(p.REGION_UN ?? ''),
                subregion: String(p.SUBREGION ?? ''),
                population: Number(p.POP_EST ?? 0),
                gdpMd: Number(p.GDP_MD ?? 0),
                bbox: { west, south, east, north },
                center: { lat: centerLat, lon: centerLon },
                radiusNm,
            },
        };
    }).filter(({ feature }) => feature.name.length > 0);

    return cachedFeatures;
}

export async function findCountryAt(lat: number, lon: number): Promise<CountryFeature | null> {
    const features = await loadFeatures();
    for (const { feature, raw } of features) {
        const { bbox } = feature;
        if (lon < bbox.west - 1 || lon > bbox.east + 1 || lat < bbox.south - 1 || lat > bbox.north + 1) continue;
        const geom = raw.geometry;
        const hit = geom.type === 'MultiPolygon'
            ? pointInMultiPolygon(lon, lat, geom.coordinates as number[][][][])
            : pointInPolygon(lon, lat, geom.coordinates as number[][][]);
        if (hit) return feature;
    }
    return null;
}

export async function findCountryByName(name: string): Promise<CountryFeature | null> {
    const features = await loadFeatures();
    const lower = name.toLowerCase();
    const match = features.find(
        ({ feature }) =>
            feature.name.toLowerCase() === lower ||
            feature.iso3.toLowerCase() === lower ||
            feature.iso2.toLowerCase() === lower,
    );
    return match?.feature ?? null;
}

export async function getAllCountries(): Promise<CountryFeature[]> {
    const features = await loadFeatures();
    return features.map(({ feature }) => feature);
}

export function getFlagEmoji(iso2: string): string {
    if (!iso2 || iso2.length !== 2 || iso2 === '-1') return '🌍';
    try {
        const a = iso2.toUpperCase().codePointAt(0)! - 65 + 0x1f1e6;
        const b = iso2.toUpperCase().codePointAt(1)! - 65 + 0x1f1e6;
        return String.fromCodePoint(a) + String.fromCodePoint(b);
    } catch {
        return '🌍';
    }
}
