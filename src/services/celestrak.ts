import { type SatelliteRecord } from '@/types/satellite';

const CELESTRAK_BASE = 'https://celestrak.org/NORAD/elements/gp.php';

export async function fetchTLEData(group: string = 'stations'): Promise<SatelliteRecord[]> {
    const url = `${CELESTRAK_BASE}?GROUP=${group}&FORMAT=tle`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`CelesTrak feil: ${response.status}`);
    }

    const text = await response.text();
    return parseTLE(text);
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
