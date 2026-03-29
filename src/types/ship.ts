export interface Ship {
    mmsi: number;
    name: string;
    lat: number;
    lon: number;
    speed: number; // knots
    course: number; // degrees
    heading: number; // degrees
    shipType: number;
    destination: string;
}
