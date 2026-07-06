// Ren fly-kinematikk — delt mellom FlightLayer (main thread) og
// channel-workerens dead-reckoning-løkke. Ingen Cesium/DOM-avhengigheter,
// så modulen kan importeres i web workers.

export const FLIGHT_POLL_MS = 10_000;
/** Stopp ekstrapolering etter 3 missede polls (30s). */
export const DR_MAX_AGE_MS = FLIGHT_POLL_MS * 3;

const EARTH_RADIUS_M = 6_371_000;
const DEG = Math.PI / 180;

export interface GeoPosition {
    lon: number;
    lat: number;
}

/**
 * Storsirkel-dead-reckoning: projiser (lon, lat) fremover med
 * (velocity × elapsed) langs heading. Samme matte som FlightLayers
 * opprinnelige extrapolatePosition, uten Cartesian3-konvertering.
 */
export function extrapolateGreatCircle(
    lon: number,
    lat: number,
    headingDeg: number,
    velocityMps: number,
    elapsedS: number,
): GeoPosition {
    const headingRad = headingDeg * DEG;
    const distM = velocityMps * elapsedS;
    const latRad = lat * DEG;
    const dLatRad = (distM * Math.cos(headingRad)) / EARTH_RADIUS_M;
    const dLonRad = (distM * Math.sin(headingRad)) / (EARTH_RADIUS_M * Math.cos(latRad));
    return {
        lon: lon + dLonRad / DEG,
        lat: lat + dLatRad / DEG,
    };
}

/** Heading (grader fra nord) → billboard.rotation (radianer, mot klokka). */
export function headingToBillboardRotation(headingDeg: number): number {
    return -headingDeg * DEG;
}
