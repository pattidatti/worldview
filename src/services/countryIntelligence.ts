import { type CountryFeature } from '@/utils/countryLookup';
import { fetchFlights } from './airplaneslive';
import { fetchConflicts } from './acled';
import { fetchDisasters } from './eonet';
import { fetchNewsEvents } from './gdelt';
import { fetchWikiSummary, type WikiSummary } from './wikipedia';
import { type Flight } from '@/types/flight';
import { type ConflictEvent } from '@/types/conflict';
import { type Disaster } from '@/types/disaster';
import { type NewsEvent } from '@/types/news';

export interface RiskScore {
    militarisering: number;
    okonomi: number;
    gps: number;
    natur: number;
    nyheter: number;
}

export interface CountryIntelligence {
    flights: Flight[];
    conflicts: ConflictEvent[];
    disasters: Disaster[];
    news: NewsEvent[];
    riskScore: RiskScore;
    wikiSummary?: WikiSummary | null;
}

const intelCache = new Map<string, { data: CountryIntelligence; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function inBbox(lat: number, lon: number, bbox: CountryFeature['bbox']): boolean {
    return lon >= bbox.west && lon <= bbox.east && lat >= bbox.south && lat <= bbox.north;
}

function computeRisk(
    country: CountryFeature,
    conflicts: ConflictEvent[],
    disasters: Disaster[],
    news: NewsEvent[],
): RiskScore {
    const militarisering = Math.min(100, Math.round((conflicts.length / 30) * 100));
    const natur = Math.min(100, Math.round((disasters.length / 6) * 100));
    const nyheter = Math.min(100, Math.round((news.length / 100) * 100));

    const gdpPerCapita = country.gdpMd > 0 && country.population > 0
        ? (country.gdpMd * 1e6) / country.population
        : 500;
    const logMax = Math.log10(100_000);
    const logVal = Math.max(0, Math.log10(Math.max(1, gdpPerCapita)));
    const okonomi = Math.round(Math.max(5, Math.min(95, (1 - logVal / logMax) * 100)));

    return { militarisering, okonomi, gps: 0, natur, nyheter };
}

export async function fetchCountryIntelligence(country: CountryFeature): Promise<CountryIntelligence> {
    const cacheKey = country.iso3 || country.name;
    const cached = intelCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        return cached.data;
    }

    const viewport = {
        west: country.bbox.west,
        south: country.bbox.south,
        east: country.bbox.east,
        north: country.bbox.north,
    };

    const [allFlights, allConflicts, allDisasters, allNews, wikiSummary] = await Promise.all([
        fetchFlights(viewport).catch(() => [] as Flight[]),
        fetchConflicts().catch(() => [] as ConflictEvent[]),
        fetchDisasters().catch(() => [] as Disaster[]),
        fetchNewsEvents().catch(() => [] as NewsEvent[]),
        fetchWikiSummary(country.name).catch(() => null),
    ]);

    const conflicts = allConflicts.filter(
        (c) => c.country.toLowerCase() === country.name.toLowerCase() ||
               inBbox(c.lat, c.lon, country.bbox),
    );
    const disasters = allDisasters.filter((d) => inBbox(d.lat, d.lon, country.bbox));
    const news = allNews.filter((n) => inBbox(n.lat, n.lon, country.bbox));

    const result: CountryIntelligence = {
        flights: allFlights,
        conflicts,
        disasters,
        news,
        riskScore: computeRisk(country, conflicts, disasters, news),
        wikiSummary,
    };

    intelCache.set(cacheKey, { data: result, ts: Date.now() });
    return result;
}

export interface CountryRankingEntry {
    country: string;
    iso2: string;
    count: number;
}

export async function fetchConflictRankings(): Promise<CountryRankingEntry[]> {
    const events = await fetchConflicts().catch(() => [] as ConflictEvent[]);
    const counts: Record<string, number> = {};
    for (const e of events) {
        if (e.country) counts[e.country] = (counts[e.country] ?? 0) + 1;
    }
    return Object.entries(counts)
        .map(([country, count]) => ({ country, iso2: '', count }))
        .sort((a, b) => b.count - a.count);
}

export async function fetchNewsRankings(): Promise<CountryRankingEntry[]> {
    const events = await fetchNewsEvents().catch(() => [] as NewsEvent[]);
    const counts: Record<string, { count: number; lon: number; lat: number }> = {};
    for (const e of events) {
        const key = `${Math.round(e.lat)}_${Math.round(e.lon)}`;
        if (!counts[key]) counts[key] = { count: 0, lon: e.lon, lat: e.lat };
        counts[key].count++;
    }
    // Group by ~2° grid cells as proxy for regions
    return Object.entries(counts)
        .map(([key, { count }]) => ({ country: key, iso2: '', count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 50);
}
