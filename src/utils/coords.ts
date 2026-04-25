/** Gyldig (lat, lon)? Avviser NaN, out-of-range, og (0,0)-området ("Null Island"). */
export function isValidLatLon(lat: unknown, lon: unknown): boolean {
    if (typeof lat !== 'number' || typeof lon !== 'number') return false;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
    if (Math.abs(lat) < 0.01 && Math.abs(lon) < 0.01) return false;
    return true;
}
