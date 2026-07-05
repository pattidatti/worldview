import { Cartographic } from 'cesium';

/**
 * Cache for globe.getHeight per (lat,lon)-grid-celle (~100m oppløsning).
 * Terrenghøyden er stabil i 30s-vinduer for entiteter som beveger seg langs
 * bakken/havflaten. Ucachede getHeight-kall per entitet per tick er blant de
 * dyreste operasjonene i oppdateringsløkkene (skip, biler).
 */
const HEIGHT_CACHE = new Map<string, { h: number; ts: number }>();
const HEIGHT_TTL_MS = 30_000;
const heightCartoScratch = new Cartographic();

export function cachedGlobeHeight(
    scene: { globe: { getHeight: (c: Cartographic) => number | undefined } },
    lon: number,
    lat: number,
    fallback: number,
): number {
    const key = `${Math.round(lon * 1000)}:${Math.round(lat * 1000)}`;
    const now = Date.now();
    const hit = HEIGHT_CACHE.get(key);
    if (hit && now - hit.ts < HEIGHT_TTL_MS) return hit.h;
    Cartographic.fromDegrees(lon, lat, 0, heightCartoScratch);
    const h = scene.globe.getHeight(heightCartoScratch) ?? fallback;
    HEIGHT_CACHE.set(key, { h, ts: now });
    if (HEIGHT_CACHE.size > 5000) {
        // Enkel oppryddingsstrategi: drop første 1000 entries når cache vokser
        const it = HEIGHT_CACHE.keys();
        for (let i = 0; i < 1000; i++) HEIGHT_CACHE.delete(it.next().value as string);
    }
    return h;
}
