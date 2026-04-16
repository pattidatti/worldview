// Fetcher for airplanes.live v2 brukt av snapshotWorker.
// Merk: airplanes.live har ingen global-endpoint (max 250nm radius), så vi polker
// flere punkter rundt primær-interesseområdet (Nord-Europa) og deduper på hex.
// Utvides ved behov — holdes minimalt for fase 3 MVP.

const API_BASE = 'https://api.airplanes.live/v2';

interface AcEntry {
    hex?: string;
    flight?: string;
    lat?: number;
    lon?: number;
    alt_baro?: number | 'ground';
    alt_geom?: number;
    gs?: number;
    track?: number;
    baro_rate?: number;
    dbFlags?: number;
    type?: string;
    r?: string;
    t?: string;
    seen?: number;
}

export interface SnapshotFlight {
    icao24: string;
    callsign: string;
    lon: number;
    lat: number;
    altitude: number;
    velocity: number;
    heading: number;
    verticalRate: number;
    onGround: boolean;
    positionSource: number;
    isMilitary: boolean;
    registration?: string;
    aircraftType?: string;
}

// Sample-punkter som dekker Nord-Europa + Nordatlantiken bra nok for MVP.
// Hver fetch er 250nm = ~463km. Overlapp er OK — dedupe på hex.
const SAMPLE_POINTS: Array<{ lat: number; lon: number }> = [
    { lat: 60, lon: 10 },   // Sør-Norge
    { lat: 68, lon: 18 },   // Nord-Norge
    { lat: 54, lon: -2 },   // UK
    { lat: 52, lon: 12 },   // Nord-Tyskland/Polen
    { lat: 45, lon: 10 },   // Alpene
];
const RADIUS_NM = 250;

function transponderType(ac: AcEntry): number {
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

function toFlight(ac: AcEntry): SnapshotFlight | null {
    if (ac.lat == null || ac.lon == null) return null;
    if ((ac.seen ?? 0) > 60) return null;
    const onGround = ac.alt_baro === 'ground';
    const altFt = onGround ? 0 : (ac.alt_geom ?? (ac.alt_baro as number) ?? 0);
    const icao24 = (ac.hex ?? '').toLowerCase();
    if (!icao24) return null;
    return {
        icao24,
        callsign: (ac.flight ?? '').trim(),
        lon: ac.lon,
        lat: ac.lat,
        altitude: altFt * 0.3048,
        velocity: (ac.gs ?? 0) * 0.514444,
        heading: ac.track ?? 0,
        verticalRate: (ac.baro_rate ?? 0) * 0.00508,
        onGround,
        positionSource: transponderType(ac),
        isMilitary: ((ac.dbFlags ?? 0) & 1) === 1,
        registration: ac.r,
        aircraftType: ac.t,
    };
}

const FETCH_TIMEOUT_MS = 20_000;

async function fetchPoint(lat: number, lon: number, radiusNm: number): Promise<AcEntry[]> {
    const url = `${API_BASE}/point/${lat}/${lon}/${radiusNm}`;
    try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
        const res = await fetch(url, { headers: { 'User-Agent': 'worldview-cf/1.0' }, signal: ac.signal });
        clearTimeout(timer);
        if (res.status === 429) {
            console.warn(`[flights] rate-limited at ${lat},${lon}`);
            return [];
        }
        if (!res.ok) {
            console.warn(`[flights] fetch feilet ${res.status} ved ${lat},${lon}`);
            return [];
        }
        const data = await res.json() as { ac?: AcEntry[] };
        return data.ac ?? [];
    } catch (e) {
        console.warn(`[flights] fetch-exception ved ${lat},${lon}`, e);
        return [];
    }
}

export async function fetchAllFlights(): Promise<SnapshotFlight[]> {
    const results = await Promise.all(
        SAMPLE_POINTS.map((p) => fetchPoint(p.lat, p.lon, RADIUS_NM)),
    );
    const byHex = new Map<string, SnapshotFlight>();
    for (const batch of results) {
        for (const ac of batch) {
            const f = toFlight(ac);
            if (f && !byHex.has(f.icao24)) byHex.set(f.icao24, f);
        }
    }
    return Array.from(byHex.values());
}
