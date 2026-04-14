import { type SatelliteRecord } from '@/types/satellite';

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

    const url = `${CELESTRAK_BASE}?GROUP=${group}&FORMAT=tle`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`CelesTrak feil: ${response.status}`);
    }

    const text = await response.text();
    const records = parseTLE(text);
    lsSet(group, records);
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
