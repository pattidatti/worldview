import { type ISSPosition } from '@/types/iss';

const URL = 'https://api.wheretheiss.at/v1/satellites/25544';

export async function fetchISS(): Promise<ISSPosition[]> {
    const res = await fetch(URL);
    if (!res.ok) throw new Error(`ISS API: ${res.status}`);
    const data = await res.json() as {
        latitude: number;
        longitude: number;
        altitude: number;
        velocity: number;
        visibility: string;
        timestamp: number;
    };
    if (!Number.isFinite(data.latitude) || !Number.isFinite(data.longitude)) return [];
    return [{
        id: 'iss',
        lat: data.latitude,
        lon: data.longitude,
        altitude: data.altitude,
        velocity: data.velocity,
        visibility: data.visibility,
        ts: data.timestamp * 1000,
    }];
}
