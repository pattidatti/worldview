import * as satellitejs from 'satellite.js';
import { type SatelliteRecord, type SatellitePosition } from '@/types/satellite';

export function computePositions(records: SatelliteRecord[], time?: Date): SatellitePosition[] {
    const now = time ?? new Date();
    const positions: SatellitePosition[] = [];

    for (const rec of records) {
        try {
            const satrec = satellitejs.twoline2satrec(rec.tle1, rec.tle2);
            const posVel = satellitejs.propagate(satrec, now);

            if (typeof posVel.position === 'boolean' || !posVel.position) continue;
            if (typeof posVel.velocity === 'boolean' || !posVel.velocity) continue;

            const gmst = satellitejs.gstime(now);
            const geo = satellitejs.eciToGeodetic(posVel.position, gmst);

            const lat = satellitejs.degreesLat(geo.latitude);
            const lon = satellitejs.degreesLong(geo.longitude);
            const alt = geo.height;

            const { x, y, z } = posVel.velocity;
            const velocity = Math.sqrt(x * x + y * y + z * z);

            const noradId = rec.tle1.substring(2, 7).trim();

            positions.push({ name: rec.name, lat, lon, alt, velocity, noradId });
        } catch {
            // Skip satellites with invalid TLE data
        }
    }

    return positions;
}

/** Jordens middelradius i km */
const EARTH_RADIUS_KM = 6371;

/**
 * Beregner satellittens ground track: en liste av [lon, lat]-punkter
 * fra -pastMinutes til +futureMinutes relativt til nå, med stepMinutes intervall.
 * Returnerer separate segmenter der banen krysser datumgrensen (180°/-180° meridian).
 */
export function computeGroundTrack(
    rec: SatelliteRecord,
    pastMinutes = 45,
    futureMinutes = 45,
    stepMinutes = 1,
): { past: [number, number][]; future: [number, number][] } {
    let satrec: ReturnType<typeof satellitejs.twoline2satrec>;
    try {
        satrec = satellitejs.twoline2satrec(rec.tle1, rec.tle2);
    } catch {
        return { past: [], future: [] };
    }
    const now = Date.now();
    const past: [number, number][] = [];
    const future: [number, number][] = [];

    for (let m = -pastMinutes; m <= futureMinutes; m += stepMinutes) {
        try {
            const t = new Date(now + m * 60_000);
            const pv = satellitejs.propagate(satrec, t);
            if (typeof pv.position === 'boolean' || !pv.position) continue;
            const gmst = satellitejs.gstime(t);
            const geo = satellitejs.eciToGeodetic(pv.position, gmst);
            const lon = satellitejs.degreesLong(geo.longitude);
            const lat = satellitejs.degreesLat(geo.latitude);
            if (m <= 0) past.push([lon, lat]);
            else future.push([lon, lat]);
        } catch { /* skip */ }
    }

    return { past, future };
}

/**
 * Beregner dekningsomkretsen (footprint) til en satellitt på overflaten.
 * Basert på satellittens høyde og en minimum elevasjonsvinkel (standard 5°).
 * Returnerer en liste av [lon, lat]-punkter som danner en polygon.
 */
export function computeFootprint(
    lat: number,
    lon: number,
    altKm: number,
    minElevDeg = 5,
    steps = 72,
): [number, number][] {
    const minElevRad = (minElevDeg * Math.PI) / 180;
    // Halvåpningsvinkel (Earth central angle) fra sub-satellite point til dekningskanten
    const earthAngle = Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altKm)) - minElevRad;
    if (earthAngle <= 0) return [];

    const latRad = (lat * Math.PI) / 180;
    const lonRad = (lon * Math.PI) / 180;
    const points: [number, number][] = [];

    for (let i = 0; i < steps; i++) {
        const bearing = (2 * Math.PI * i) / steps;
        // Sfærisk trigonometri: beregn punkt på overflaten med gitt avstandsvinkel og bearing
        const pLat = Math.asin(
            Math.sin(latRad) * Math.cos(earthAngle) +
            Math.cos(latRad) * Math.sin(earthAngle) * Math.cos(bearing),
        );
        const pLon = lonRad + Math.atan2(
            Math.sin(bearing) * Math.sin(earthAngle) * Math.cos(latRad),
            Math.cos(earthAngle) - Math.sin(latRad) * Math.sin(pLat),
        );
        points.push([(pLon * 180) / Math.PI, (pLat * 180) / Math.PI]);
    }
    // Lukk polygonen
    if (points.length > 0) points.push(points[0]);
    return points;
}
