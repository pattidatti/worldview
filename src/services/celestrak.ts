import { type SatelliteRecord } from '@/types/satellite';
import { getJsonCache, setJsonCache } from './firestoreCache';

// MERK (fremtidig arbeid): CelesTrak passerer det 5-sifrede katalog-taket
// (69999) rundt juli 2026. Nye objekter får 6-sifrede numre som TLE-formatet
// IKKE kan representere; CelesTrak anbefaler migrering til OMM (FORMAT=json).
// Vi beholder FORMAT=tle inntil videre fordi satellite.js v5 kun eksporterer
// twoline2satrec (ingen json2satrec/OMM→satrec). `stations`-gruppen vi bruker
// (inkl. ISS 25544) består av eldre objekter og virker fint med TLE i dag.
// OMM-migrering krever oppgradering/erstatning av SGP4-parsingen — eget punkt.
const CELESTRAK_BASE = 'https://celestrak.org/NORAD/elements/gp.php';
const LS_PREFIX = 'wv_tle:';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 timer

interface TleCache {
    ts: number;
    records: SatelliteRecord[];
}

function lsGet(group: string): SatelliteRecord[] | null {
    try {
        const raw = localStorage.getItem(LS_PREFIX + group);
        if (!raw) return null;
        const entry: TleCache = JSON.parse(raw);
        if (Date.now() - entry.ts > CACHE_TTL_MS) {
            localStorage.removeItem(LS_PREFIX + group);
            return null;
        }
        return entry.records;
    } catch {
        return null;
    }
}

function lsSet(group: string, records: SatelliteRecord[]): void {
    try {
        localStorage.setItem(LS_PREFIX + group, JSON.stringify({ ts: Date.now(), records } satisfies TleCache));
    } catch { /* quota exceeded — ignorerer */ }
}

export async function fetchTLEData(group: string = 'stations'): Promise<SatelliteRecord[]> {
    const cached = lsGet(group);
    if (cached) return cached;

    // L2.5: delt Firestore-cache — TLE er identisk for alle brukere. CelesTrak
    // oppdaterer GP-data kun hver 2. time og blokkerer aggressivt ved overforbruk.
    const fsKey = `tle:${group}`;
    const fs = await getJsonCache<SatelliteRecord[]>(fsKey, CACHE_TTL_MS);
    if (fs && fs.length) {
        lsSet(group, fs);
        return fs;
    }

    const url = `${CELESTRAK_BASE}?GROUP=${group}&FORMAT=tle`;
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });

    if (!response.ok) {
        throw new Error(`CelesTrak feil: ${response.status}`);
    }

    const text = await response.text();
    const records = parseTLE(text);
    lsSet(group, records);
    setJsonCache(fsKey, CACHE_TTL_MS, records);
    return records;
}

function parseTLE(text: string): SatelliteRecord[] {
    const lines = text.trim().split('\n').map((l) => l.trim());
    const records: SatelliteRecord[] = [];

    for (let i = 0; i < lines.length - 2; i += 3) {
        const name = lines[i];
        const tle1 = lines[i + 1];
        const tle2 = lines[i + 2];

        if (tle1?.startsWith('1 ') && tle2?.startsWith('2 ')) {
            records.push({ name, tle1, tle2 });
        }
    }

    return records;
}
