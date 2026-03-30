import { type Flight, type PositionSource } from '@/types/flight';
import { type Viewport } from '@/hooks/useViewport';

const API_BASE = 'https://api.airplanes.live/v2';

interface AcEntry {
    hex?: string;
    flight?: string;
    lat?: number;
    lon?: number;
    alt_baro?: number | 'ground';
    alt_geom?: number;
    gs?: number;          // knots
    track?: number;       // degrees
    baro_rate?: number;   // ft/min
    dbFlags?: number;
    type?: string;
    r?: string;           // registration
    t?: string;           // aircraft type code
    seen?: number;
}

function transponderType(ac: AcEntry): PositionSource {
    switch (ac.type) {
        case 'adsb_icao':
        case 'adsb_icao_nt':
        case 'adsc':
            return 0;
        case 'mlat':
            return 2;
        default:
            return 1;
    }
}

function toFlight(ac: AcEntry): Flight | null {
    if (ac.lat == null || ac.lon == null) return null;
    const onGround = ac.alt_baro === 'ground';
    const altFt = onGround ? 0 : (ac.alt_geom ?? (ac.alt_baro as number) ?? 0);
    return {
        icao24: (ac.hex ?? '').toLowerCase(),
        callsign: (ac.flight ?? '').trim(),
        originCountry: '',                        // not provided by airplanes.live
        lon: ac.lon,
        lat: ac.lat,
        altitude: altFt * 0.3048,                // feet → meters
        velocity: (ac.gs ?? 0) * 0.514444,       // knots → m/s
        heading: ac.track ?? 0,
        verticalRate: (ac.baro_rate ?? 0) * 0.00508, // ft/min → m/s
        onGround,
        positionSource: transponderType(ac),
        isMilitary: ((ac.dbFlags ?? 0) & 1) === 1,
    };
}

function viewportToPoint(viewport: Viewport): { lat: number; lon: number; radiusNm: number } {
    const lat = (viewport.north + viewport.south) / 2;
    const lon = (viewport.east + viewport.west) / 2;
    const latSpan = (viewport.north - viewport.south) * 60;
    const lonSpan = (viewport.east - viewport.west) * 60 * Math.cos((lat * Math.PI) / 180);
    const radiusNm = Math.min(250, Math.ceil(Math.sqrt(latSpan ** 2 + lonSpan ** 2) / 2));
    return { lat, lon, radiusNm };
}

export async function fetchFlights(viewport?: Viewport | null): Promise<Flight[]> {
    let url: string;
    if (viewport) {
        const { lat, lon, radiusNm } = viewportToPoint(viewport);
        url = `${API_BASE}/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${radiusNm}`;
    } else {
        // Global fetch — use a very large radius from equator (capped at 250nm)
        url = `${API_BASE}/point/0/0/250`;
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error(`airplanes.live feil: ${response.status}`);
    const data = await response.json() as { ac?: AcEntry[] };
    if (!data.ac) return [];

    const flights: Flight[] = [];
    for (const ac of data.ac) {
        const f = toFlight(ac);
        if (f) flights.push(f);
    }
    return flights;
}
