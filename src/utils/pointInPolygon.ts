// Ray-casting point-in-polygon for GeoJSON Polygon/MultiPolygon ring coordinates

function ringContains(lon: number, lat: number, ring: number[][]): boolean {
    let inside = false;
    const n = ring.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
}

export function pointInPolygon(lon: number, lat: number, rings: number[][][]): boolean {
    return ringContains(lon, lat, rings[0]);
}

export function pointInMultiPolygon(lon: number, lat: number, polygons: number[][][][]): boolean {
    for (const rings of polygons) {
        if (pointInPolygon(lon, lat, rings)) return true;
    }
    return false;
}
