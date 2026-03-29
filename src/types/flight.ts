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
}
