// Tetthets-binning for GLOBAL-tier (jf. docs/ARCHITECTURE-VISION.md):
// primitives har ingen innebygd klustring, så på globalt zoomnivå vises
// tusenvis av objekter som få tetthetsceller — én PointPrimitive per celle.
// Ren funksjon, DOM-/Cesium-fri, gjenbrukbar for ships m.fl. i fase C.

export interface DensityCell {
    /** Celle-senter i grader. */
    lon: number;
    lat: number;
    count: number;
}

export function binToDensityCells(
    items: readonly { lon: number; lat: number }[],
    cellDeg: number = 1,
): DensityCell[] {
    const counts = new Map<string, DensityCell>();
    for (const item of items) {
        const cellLon = Math.floor(item.lon / cellDeg);
        const cellLat = Math.floor(item.lat / cellDeg);
        const key = `${cellLon}:${cellLat}`;
        const existing = counts.get(key);
        if (existing) {
            existing.count++;
        } else {
            counts.set(key, {
                lon: (cellLon + 0.5) * cellDeg,
                lat: (cellLat + 0.5) * cellDeg,
                count: 1,
            });
        }
    }
    return [...counts.values()];
}
