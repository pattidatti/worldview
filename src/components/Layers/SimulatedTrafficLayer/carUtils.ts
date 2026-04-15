import { Color } from 'cesium';
import { type RoadSegment, type CarState } from '@/types/simulatedTraffic';
import { type TrafficEvent } from '@/types/traffic';

const MAX_TOTAL_CARS = 600;
const MAX_SEGMENTS = 200;

export const BASE_SPEEDS_MS: Record<string, number> = {
    primary: 13.9,     // 50 km/h
    secondary: 11.1,   // 40 km/h
    tertiary: 8.3,     // 30 km/h
    residential: 5.6,  // 20 km/h
};

export const HIGHWAY_LABELS: Record<string, string> = {
    primary: 'Primærveg',
    secondary: 'Sekundærveg',
    tertiary: 'Tertiærveg',
    residential: 'Boliggate',
};

function carsForSegment(lengthM: number): number {
    if (lengthM < 200) return 0;
    if (lengthM < 500) return 1;
    if (lengthM < 2000) return 2;
    if (lengthM < 5000) return 3;
    return 4;
}

// Convert a total arc fraction (0..1) to (legIndex, legFraction)
function arcFractionToLeg(
    totalFraction: number,
    legLengths: number[],
    totalLength: number,
): { legIndex: number; legFraction: number } {
    if (totalLength <= 0 || legLengths.length === 0) return { legIndex: 0, legFraction: 0 };
    const targetDist = totalFraction * totalLength;
    let accumulated = 0;

    for (let i = 0; i < legLengths.length; i++) {
        const next = accumulated + legLengths[i];
        if (next >= targetDist || i === legLengths.length - 1) {
            const legFraction =
                legLengths[i] > 0 ? (targetDist - accumulated) / legLengths[i] : 0;
            return { legIndex: i, legFraction: Math.min(Math.max(legFraction, 0), 0.999) };
        }
        accumulated = next;
    }
    return { legIndex: 0, legFraction: 0 };
}

function haversineM(lon1: number, lat1: number, lon2: number, lat2: number): number {
    const R = 6_371_000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function lerpRgb(
    c1: [number, number, number],
    c2: [number, number, number],
    t: number,
): [number, number, number] {
    const clamp = Math.min(Math.max(t, 0), 1);
    return [
        Math.round(c1[0] + (c2[0] - c1[0]) * clamp),
        Math.round(c1[1] + (c2[1] - c1[1]) * clamp),
        Math.round(c1[2] + (c2[2] - c1[2]) * clamp),
    ];
}

const RGB_RED: [number, number, number] = [0xff, 0x33, 0x33];
const RGB_YELLOW: [number, number, number] = [0xff, 0xcc, 0x00];
const RGB_GREEN: [number, number, number] = [0x00, 0xcc, 0x44];

export function speedColorHex(factor: number): string {
    const f = Math.min(Math.max(factor, 0), 1);
    const rgb = f <= 0.45 ? lerpRgb(RGB_RED, RGB_YELLOW, f / 0.45) : lerpRgb(RGB_YELLOW, RGB_GREEN, (f - 0.45) / 0.55);
    return `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export function speedColor(factor: number): Color {
    return Color.fromCssColorString(speedColorHex(factor));
}

export function buildCarPool(
    segments: RoadSegment[],
    speedZones: Map<string, number>,
): CarState[] {
    const sorted = [...segments].sort((a, b) => b.lengthM - a.lengthM).slice(0, MAX_SEGMENTS);
    const cars: CarState[] = [];

    for (const seg of sorted) {
        if (cars.length >= MAX_TOTAL_CARS) break;
        const n = carsForSegment(seg.lengthM);
        if (n === 0) continue;

        const baseSpeed = BASE_SPEEDS_MS[seg.highway] ?? BASE_SPEEDS_MS.tertiary;
        const speedFactor = speedZones.get(seg.id) ?? 1.0;

        for (let k = 0; k < n && cars.length < MAX_TOTAL_CARS; k++) {
            const totalFraction = (k + 0.5) / n;
            const { legIndex, legFraction } = arcFractionToLeg(
                totalFraction,
                seg.legLengths,
                seg.lengthM,
            );

            cars.push({
                id: `car-${seg.id}-${k}`,
                segmentId: seg.id,
                legIndex,
                fraction: legFraction,
                baseSpeedMs: baseSpeed,
                speedFactor,
                lastFrameMs: 0, // Set when entity is created
            });
        }
    }

    return cars;
}

export function matchIncidentsToSegments(
    events: TrafficEvent[],
    segments: RoadSegment[],
): Map<string, number> {
    const result = new Map<string, number>();
    const RADIUS_M = 300;

    for (const seg of segments) {
        if (seg.positions.length === 0) continue;

        // Check start, midpoint, and end of segment
        const checkPoints: [number, number][] = [
            seg.positions[0],
            seg.positions[Math.floor(seg.positions.length / 2)],
            seg.positions[seg.positions.length - 1],
        ];

        let worstFactor = 1.0;

        for (const event of events) {
            for (const [lon, lat] of checkPoints) {
                const dist = haversineM(event.lon, event.lat, lon, lat);
                if (dist <= RADIUS_M) {
                    const factor =
                        event.severity === 'high'
                            ? 0.15
                            : event.severity === 'medium'
                              ? 0.45
                              : 0.8;
                    worstFactor = Math.min(worstFactor, factor);
                    break; // No need to check other points for this event
                }
            }
        }

        if (worstFactor < 1.0) {
            result.set(seg.id, worstFactor);
        }
    }

    return result;
}
