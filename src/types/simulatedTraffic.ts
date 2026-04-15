export interface RoadSegment {
    id: string;
    positions: [number, number][];  // [lon, lat] pairs
    name: string;
    highway: string;
    lengthM: number;
    legLengths: number[];
    legHeadings: number[];
}

export interface CarState {
    id: string;              // 'car-<segmentId>-<n>'
    segmentId: string;
    legIndex: number;
    fraction: number;        // 0..1 within current leg
    baseSpeedMs: number;
    speedFactor: number;     // 0..1, modulated by TomTom data
    lastFrameMs: number;
}
