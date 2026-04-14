import { type Asteroid } from '@/types/asteroid';

const API_KEY = import.meta.env.VITE_NASA_API_KEY ?? 'DEMO_KEY';
const LS_KEY = 'wv_neo';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 timer

interface NeoCache {
    ts: number;
    startDate: string;
    asteroids: Asteroid[];
}

function lsGet(): Asteroid[] | null {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return null;
        const entry: NeoCache = JSON.parse(raw);
        // Ugyldig hvis cache er gammel ELLER startdato ikke lenger er i dag
        if (Date.now() - entry.ts > CACHE_TTL_MS || entry.startDate !== todayStr()) {
            localStorage.removeItem(LS_KEY);
            return null;
        }
        return entry.asteroids;
    } catch {
        return null;
    }
}

function lsSet(asteroids: Asteroid[]): void {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify({ ts: Date.now(), startDate: todayStr(), asteroids } satisfies NeoCache));
    } catch { /* quota exceeded — ignorerer */ }
}

function todayStr(): string {
    return new Date().toISOString().slice(0, 10);
}

function plusDays(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
}

export async function fetchAsteroids(): Promise<Asteroid[]> {
    const cached = lsGet();
    if (cached) return cached;

    const start = todayStr();
    const end = plusDays(7);
    const url = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${start}&end_date=${end}&api_key=${API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`NASA NeoWs feil: ${response.status}`);
    const data = await response.json();

    const results: Asteroid[] = [];
    for (const dateKey of Object.keys(data.near_earth_objects)) {
        for (const neo of data.near_earth_objects[dateKey]) {
            const approach = neo.close_approach_data?.[0];
            if (!approach) continue;
            results.push({
                id: neo.id,
                name: neo.name.replace(/[()]/g, '').trim(),
                isHazardous: neo.is_potentially_hazardous_asteroid,
                diameterMinM: neo.estimated_diameter?.meters?.estimated_diameter_min ?? 0,
                diameterMaxM: neo.estimated_diameter?.meters?.estimated_diameter_max ?? 0,
                closeApproachDate: approach.close_approach_date_full ?? approach.close_approach_date,
                missDistanceKm: parseFloat(approach.miss_distance?.kilometers ?? '0'),
                relativeVelocityKmh: parseFloat(approach.relative_velocity?.kilometers_per_hour ?? '0'),
                nasaUrl: neo.nasa_jpl_url,
            });
        }
    }
    results.sort((a, b) => a.missDistanceKm - b.missDistanceKm);
    lsSet(results);
    return results;
}
