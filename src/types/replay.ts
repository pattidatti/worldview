// Replay-typer for entity-snapshots lest fra Firestore.

export type ReplayEntityType = 'flight' | 'ship';

export interface ReplayFlight {
    icao24: string;
    callsign: string;
    lon: number;
    lat: number;
    altitude: number;
    velocity: number;
    heading: number;
    verticalRate: number;
    onGround: boolean;
    positionSource: number;
    isMilitary: boolean;
    registration?: string;
    aircraftType?: string;
}

export interface ReplayShip {
    mmsi: number;
    name: string;
    callSign: string;
    imo: number;
    lat: number;
    lon: number;
    speed: number;
    course: number;
    heading: number;
    rateOfTurn: number;
    navStatus: number;
    shipType: number;
    length: number;
    width: number;
    draught: number;
    destination: string;
}

export type ReplayItem = ReplayFlight | ReplayShip;

export interface ReplayBucket<T = ReplayItem> {
    ts: number;
    items: T[];
}

// 10-min buckets for fly/disasters/news, 5-min for skip.
export const BUCKET_MINUTES: Record<ReplayEntityType, number> = {
    flight: 10,
    ship: 5,
};

export function bucketIntervalMs(type: ReplayEntityType): number {
    return BUCKET_MINUTES[type] * 60_000;
}

export function bucketOfDay(ts: number, type: ReplayEntityType): number {
    const d = new Date(ts);
    const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
    return Math.floor(minutes / BUCKET_MINUTES[type]);
}

export function dayKeyUTC(ts: number): string {
    const d = new Date(ts);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}_UTC`;
}

export function bucketKey(ts: number, type: ReplayEntityType): string {
    return `${dayKeyUTC(ts)}_${String(bucketOfDay(ts, type)).padStart(3, '0')}`;
}

// Quantiser ts til start av bucket-interval.
export function bucketStart(ts: number, type: ReplayEntityType): number {
    const interval = bucketIntervalMs(type);
    return Math.floor(ts / interval) * interval;
}
