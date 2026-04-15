import { type Sigmet } from '@/types/sigmet';
import { proxied } from '@/utils/corsProxy';

const URL = 'https://aviationweather.gov/api/data/sigmet?format=geojson';

export async function fetchSigmets(): Promise<Sigmet[]> {
    const res = await fetch(proxied(URL));
    if (!res.ok) throw new Error(`SIGMET feil: ${res.status}`);
    const json = await res.json();
    const features: unknown[] = json?.features ?? [];

    const sigmets: Sigmet[] = [];
    for (const f of features) {
        const feat = f as {
            geometry?: { type?: string; coordinates?: unknown };
            properties?: Record<string, unknown>;
        };
        const p = feat.properties ?? {};
        const geom = feat.geometry;
        if (!geom?.type || !geom.coordinates) continue;

        let coords: number[][][];
        if (geom.type === 'Polygon') {
            coords = geom.coordinates as number[][][];
        } else if (geom.type === 'MultiPolygon') {
            coords = (geom.coordinates as number[][][][]).flat(1);
        } else {
            continue;
        }

        const idStr = String(p.airSigmetId ?? `sigmet-${sigmets.length}`);
        sigmets.push({
            id: idStr,
            hazard: String(p.hazard ?? 'TURB'),
            severity: String(p.severity ?? ''),
            altitudeLow: p.altitudeLow1 != null ? Number(p.altitudeLow1) : null,
            altitudeHigh: p.altitudeHi1 != null ? Number(p.altitudeHi1) : null,
            validFrom: String(p.validTimeFrom ?? ''),
            validTo: String(p.validTimeTo ?? ''),
            area: String(p.icaoId ?? ''),
            coordinates: coords,
        });
    }
    return sigmets;
}
