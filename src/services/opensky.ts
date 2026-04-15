import { type Flight, type PositionSource } from '@/types/flight';
import { type Viewport } from '@/hooks/useViewport';
import { proxied } from '@/utils/corsProxy';

const OPENSKY_BASE = 'https://opensky-network.org/api';

export async function fetchFlights(viewport?: Viewport | null): Promise<Flight[]> {
    let url = `${OPENSKY_BASE}/states/all`;

    if (viewport) {
        const params = new URLSearchParams({
            lamin: String(Math.max(viewport.south, -90)),
            lamax: String(Math.min(viewport.north, 90)),
            lomin: String(Math.max(viewport.west, -180)),
            lomax: String(Math.min(viewport.east, 180)),
        });
        url += `?${params}`;
    }

    const response = await fetch(url);

    if (response.status === 429) {
        throw new RateLimitError();
    }

    if (!response.ok) {
        throw new Error(`OpenSky feil: ${response.status}`);
    }

    const data = await response.json();
    if (!data.states) return [];

    return data.states
        .filter((s: unknown[]) => s[5] != null && s[6] != null)
        .map((s: unknown[]): Flight => ({
            icao24: s[0] as string,
            callsign: ((s[1] as string) ?? '').trim(),
            originCountry: s[2] as string,
            lon: s[5] as number,
            lat: s[6] as number,
            altitude: (s[13] as number) ?? (s[7] as number) ?? 0,
            velocity: (s[9] as number) ?? 0,
            heading: (s[10] as number) ?? 0,
            verticalRate: (s[11] as number) ?? 0,
            onGround: s[8] as boolean,
            positionSource: (s[16] as PositionSource) ?? 0,
            isMilitary: false,
        }));
}

export class RateLimitError extends Error {
    constructor() {
        super('OpenSky rate limit');
        this.name = 'RateLimitError';
    }
}

// --- Route lookup with cache ---

export interface FlightRoute {
    origin: string;
    destination: string;
}

const ROUTE_TTL_MS = 2 * 60 * 60 * 1000; // 2 timer
const ROUTE_SS_PREFIX = 'opensky:route:';

interface CachedRoute {
    route: FlightRoute | null;
    cachedAt: number;
}

const routeCache = new Map<string, FlightRoute | null>();

function loadRouteFromSession(callsign: string): FlightRoute | null | undefined {
    try {
        const raw = sessionStorage.getItem(ROUTE_SS_PREFIX + callsign);
        if (!raw) return undefined;
        const entry: CachedRoute = JSON.parse(raw);
        if (Date.now() - entry.cachedAt > ROUTE_TTL_MS) {
            sessionStorage.removeItem(ROUTE_SS_PREFIX + callsign);
            return undefined;
        }
        return entry.route;
    } catch {
        return undefined;
    }
}

function saveRouteToSession(callsign: string, route: FlightRoute | null): void {
    try {
        const entry: CachedRoute = { route, cachedAt: Date.now() };
        sessionStorage.setItem(ROUTE_SS_PREFIX + callsign, JSON.stringify(entry));
    } catch { /* quota exceeded — ignore */ }
}

export function getCachedRoute(callsign: string): FlightRoute | null | undefined {
    const mem = routeCache.get(callsign);
    if (mem !== undefined) return mem;
    const ss = loadRouteFromSession(callsign);
    if (ss !== undefined) {
        routeCache.set(callsign, ss);
        return ss;
    }
    return undefined;
}

export async function fetchFlightRoute(callsign: string): Promise<FlightRoute | null> {
    if (!callsign) return null;

    const cached = getCachedRoute(callsign);
    if (cached !== undefined) return cached;

    try {
        const response = await fetch(proxied(`${OPENSKY_BASE}/routes?callsign=${encodeURIComponent(callsign)}`));
        if (!response.ok) {
            routeCache.set(callsign, null);
            saveRouteToSession(callsign, null);
            return null;
        }
        const data = await response.json();
        const route = data.route;
        if (!route || route.length < 2) {
            routeCache.set(callsign, null);
            saveRouteToSession(callsign, null);
            return null;
        }
        const result: FlightRoute = { origin: route[0], destination: route[1] };
        routeCache.set(callsign, result);
        saveRouteToSession(callsign, result);
        return result;
    } catch {
        routeCache.set(callsign, null);
        return null;
    }
}
