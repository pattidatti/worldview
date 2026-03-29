export interface WeatherPoint {
    name: string;
    lat: number;
    lon: number;
    temperature: number; // °C
    windSpeed: number; // m/s
    windDirection: number; // degrees
    humidity: number; // %
    precipitation: number; // mm
    symbol: string; // MET weather symbol code
}
