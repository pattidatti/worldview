// 0=ADS-B (GPS), 1=ASTERIX, 2=MLAT, 3=FLARM
export type PositionSource = 0 | 1 | 2 | 3;

export interface Flight {
    icao24: string;
    callsign: string;
    originCountry: string;
    lon: number;
    lat: number;
    altitude: number; // meters
    velocity: number; // m/s
    heading: number; // degrees from north
    verticalRate: number; // m/s
    onGround: boolean;
    positionSource: PositionSource;
    isMilitary: boolean;
    registration?: string;   // Registreringsnummer (f.eks. LN-NIG)
    aircraftType?: string;   // Flytype (f.eks. B738)
}
