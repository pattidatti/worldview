import { type WeatherPoint } from '@/types/weather';

const MET_BASE = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';
const USER_AGENT = 'WorldView/0.1 github.com/worldview';
const DEFAULT_TTL_MS = 9 * 60 * 1000; // 9 min
const SS_PREFIX = 'metno:forecast:';

interface CachedForecast {
    data: WeatherPoint;
    expiresAt: number;
}

function loadFromCache(cityName: string): WeatherPoint | null {
    try {
        const raw = sessionStorage.getItem(SS_PREFIX + cityName);
        if (!raw) return null;
        const entry: CachedForecast = JSON.parse(raw);
        if (Date.now() > entry.expiresAt) {
            sessionStorage.removeItem(SS_PREFIX + cityName);
            return null;
        }
        return entry.data;
    } catch {
        return null;
    }
}

function saveToCache(cityName: string, data: WeatherPoint, expiresHeader: string | null): void {
    try {
        const expiresAt = expiresHeader
            ? Date.parse(expiresHeader)
            : Date.now() + DEFAULT_TTL_MS;
        const entry: CachedForecast = { data, expiresAt: isNaN(expiresAt) ? Date.now() + DEFAULT_TTL_MS : expiresAt };
        sessionStorage.setItem(SS_PREFIX + cityName, JSON.stringify(entry));
    } catch { /* quota exceeded — ignore */ }
}

// Grid of cities/locations to show weather for
const LOCATIONS = [
    { name: 'Oslo', lat: 59.91, lon: 10.75 },
    { name: 'Bergen', lat: 60.39, lon: 5.32 },
    { name: 'Trondheim', lat: 63.43, lon: 10.40 },
    { name: 'Stavanger', lat: 58.97, lon: 5.73 },
    { name: 'Tromsø', lat: 69.65, lon: 18.96 },
    { name: 'Bodø', lat: 67.28, lon: 14.40 },
    { name: 'Kristiansand', lat: 58.15, lon: 8.00 },
    { name: 'Ålesund', lat: 62.47, lon: 6.15 },
    { name: 'Drammen', lat: 59.74, lon: 10.20 },
    { name: 'Haugesund', lat: 59.41, lon: 5.27 },
    { name: 'Hammerfest', lat: 70.66, lon: 23.68 },
    { name: 'Kirkenes', lat: 69.73, lon: 30.05 },
    { name: 'Longyearbyen', lat: 78.22, lon: 15.63 },
    { name: 'Lillehammer', lat: 61.12, lon: 10.47 },
    { name: 'Molde', lat: 62.74, lon: 7.16 },
    { name: 'Alta', lat: 69.97, lon: 23.27 },
    { name: 'Narvik', lat: 68.44, lon: 17.43 },
    { name: 'Kristiansund', lat: 63.11, lon: 7.73 },
];

async function fetchOneLocation(loc: { name: string; lat: number; lon: number }): Promise<WeatherPoint | null> {
    const cached = loadFromCache(loc.name);
    if (cached) return cached;

    try {
        const url = `${MET_BASE}?lat=${loc.lat}&lon=${loc.lon}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT },
        });

        if (!res.ok) return null;

        const expiresHeader = res.headers.get('Expires');
        const data = await res.json();
        const timeseries = data?.properties?.timeseries;
        if (!timeseries?.length) return null;

        const now = timeseries[0];
        const instant = now.data?.instant?.details;
        const next1h = now.data?.next_1_hours;

        if (!instant) return null;

        const result: WeatherPoint = {
            name: loc.name,
            lat: loc.lat,
            lon: loc.lon,
            temperature: instant.air_temperature ?? 0,
            windSpeed: instant.wind_speed ?? 0,
            windDirection: instant.wind_from_direction ?? 0,
            humidity: instant.relative_humidity ?? 0,
            precipitation: next1h?.details?.precipitation_amount ?? 0,
            symbol: next1h?.summary?.symbol_code ?? 'cloudy',
        };
        saveToCache(loc.name, result, expiresHeader);
        return result;
    } catch {
        return null;
    }
}

export async function fetchWeather(): Promise<WeatherPoint[]> {
    // Fetch all locations in parallel with a small batch delay to be polite
    const results = await Promise.all(LOCATIONS.map(fetchOneLocation));
    return results.filter((r): r is WeatherPoint => r !== null);
}

const SYMBOL_MAP: Record<string, string> = {
    clearsky: '☀️',
    fair: '🌤️',
    partlycloudy: '⛅',
    cloudy: '☁️',
    rain: '🌧️',
    heavyrain: '🌧️',
    lightrainshowers: '🌦️',
    rainshowers: '🌦️',
    heavyrainshowers: '🌧️',
    sleet: '🌨️',
    snow: '❄️',
    heavysnow: '❄️',
    lightsnow: '🌨️',
    snowshowers: '🌨️',
    fog: '🌫️',
    thunder: '⛈️',
    rainandthunder: '⛈️',
};

export function weatherSymbolToEmoji(symbol: string): string {
    // Symbol codes can have _day/_night/_polartwilight suffix
    const base = symbol.replace(/_day|_night|_polartwilight/g, '');
    return SYMBOL_MAP[base] ?? '🌡️';
}
