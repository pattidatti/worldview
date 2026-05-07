import type { Cesium3DTileset } from 'cesium';

/**
 * Konfigurerer streaming-/render-parametere på et Cesium3DTileset
 * for jevnere kamera-flythrough og lavere fragment-cost. Sikrer at
 * fasade-detaljer fortsatt vises tydelig i nær-zoom (200m-range),
 * mens grovere LOD brukes på lengre avstander.
 *
 * Brukes både for Google Photorealistic 3D Tiles (asset 2275207)
 * og OSM Buildings (asset 96188).
 */
export function applyTilesetPerformanceTuning(tileset: Cesium3DTileset): void {
    // Mindre tile-trafikk: SSE 24 (default 16) → ~30 % færre tile-loads
    tileset.maximumScreenSpaceError = 24;

    // Dynamisk SSE: tilegner mindre detalj til fjerne tiles, mer til de nær kamera
    tileset.dynamicScreenSpaceError = true;
    tileset.dynamicScreenSpaceErrorDensity = 0.00278;
    tileset.dynamicScreenSpaceErrorFactor = 4.0;
    tileset.dynamicScreenSpaceErrorHeightFalloff = 0.25;

    // Cache: 512 MB tile-cache + 256 MB overflow holder pyramide-fly i hele tour-løpet
    tileset.cacheBytes = 536_870_912;
    tileset.maximumCacheOverflowBytes = 268_435_456;

    // Forhåndslast destinasjons-tiles under camera.flyTo (bruker Cesium-default fly-callbacks)
    tileset.preloadFlightDestinations = true;

    // Skip-LOD strategi: hopp grove nivåer for å nå detaljerte tiles raskere
    tileset.skipLevelOfDetail = true;
    tileset.baseScreenSpaceError = 1024;
    tileset.skipScreenSpaceErrorFactor = 16;
    tileset.skipLevels = 1;
    tileset.immediatelyLoadDesiredLevelOfDetail = false;
    tileset.loadSiblings = false;
    tileset.preferLeaves = true;

    // Cull request-stream mens kameraet beveger seg → mindre nettverk-spike under flythrough
    tileset.cullRequestsWhileMoving = true;
    tileset.cullRequestsWhileMovingMultiplier = 60;
}
