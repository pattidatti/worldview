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
