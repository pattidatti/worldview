export interface Earthquake {
    id: string;
    title: string;
    magnitude: number;
    depth: number; // km
    lat: number;
    lon: number;
    time: number; // ms since epoch
    place: string;
    url: string;
}
