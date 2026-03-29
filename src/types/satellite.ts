export interface SatelliteRecord {
    name: string;
    tle1: string;
    tle2: string;
}

export interface SatellitePosition {
    name: string;
    lat: number;
    lon: number;
    alt: number; // km
    velocity: number; // km/s
    noradId: string;
}
