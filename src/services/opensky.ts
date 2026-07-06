// Flyrute-oppslag (avgangs-/ankomstflyplass) for popup-berikelse.
//
// Tidligere brukte vi OpenSky sitt udokumenterte /routes-endepunkt. OpenSky har
// i 2024–2025 gått over til OAuth2 og strammet anonym tilgang kraftig
// (400 credits/dag), og /routes var aldri en offisiell del av REST-API-et.
// Vi bruker nå adsbdb (https://api.adsbdb.com) — gratis, ingen nøkkel,
// dokumentert callsign→rute-oppslag, med CORS aktivert.

const ADSBDB_BASE = 'https://api.adsbdb.com/v0';

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

// adsbdb-airport: kort, lesbar kode for UI (IATA foretrekkes, ellers ICAO/by).
interface AdsbdbAirport {
    iata_code?: string;
    icao_code?: string;
    municipality?: string;
}

function airportLabel(a: AdsbdbAirport | undefined): string | null {
    if (!a) return null;
    return a.iata_code || a.icao_code || a.municipality || null;
}

export async function fetchFlightRoute(callsign: string): Promise<FlightRoute | null> {
    const cs = callsign.trim();
    if (!cs) return null;

    const cached = getCachedRoute(cs);
    if (cached !== undefined) return cached;

    try {
        const response = await fetch(
            `${ADSBDB_BASE}/callsign/${encodeURIComponent(cs)}`,
            { signal: AbortSignal.timeout(10_000) },
        );
        // 404 = ukjent callsign (forventet); cache null for å unngå gjentatte kall.
        if (!response.ok) {
            routeCache.set(cs, null);
            saveRouteToSession(cs, null);
            return null;
        }
        const data = await response.json() as {
            response?: { flightroute?: { origin?: AdsbdbAirport; destination?: AdsbdbAirport } } | string;
        };
        // Ved ukjent callsign returnerer adsbdb { response: "unknown callsign" }.
        const flightroute = typeof data.response === 'object' ? data.response?.flightroute : undefined;
        const origin = airportLabel(flightroute?.origin);
        const destination = airportLabel(flightroute?.destination);
        if (!origin || !destination) {
            routeCache.set(cs, null);
            saveRouteToSession(cs, null);
            return null;
        }
        const result: FlightRoute = { origin, destination };
        routeCache.set(cs, result);
        saveRouteToSession(cs, result);
        return result;
    } catch {
        // Nettverksfeil/timeout: ikke persister (kan være forbigående).
        routeCache.set(cs, null);
        return null;
    }
}
