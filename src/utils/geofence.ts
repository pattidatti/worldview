import type { LatLon } from '@/types/gate';
import type { CrossingDirection } from '@/types/timeline-event';

const EARTH_RADIUS_KM = 6371;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export const POLE_LATITUDE_LIMIT = 80;
export const MAX_SEGMENT_KM = 100;

export function haversineKm(a: LatLon, b: LatLon): number {
    const dLat = (b.lat - a.lat) * DEG_TO_RAD;
    const dLon = (b.lon - a.lon) * DEG_TO_RAD;
    const la1 = a.lat * DEG_TO_RAD;
    const la2 = b.lat * DEG_TO_RAD;
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearing(from: LatLon, to: LatLon): number {
    const la1 = from.lat * DEG_TO_RAD;
    const la2 = to.lat * DEG_TO_RAD;
    const dLon = (to.lon - from.lon) * DEG_TO_RAD;
    const y = Math.sin(dLon) * Math.cos(la2);
    const x =
        Math.cos(la1) * Math.sin(la2) -
        Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
    const deg = Math.atan2(y, x) * RAD_TO_DEG;
    return (deg + 360) % 360;
}

interface Point2D {
    e: number;
    n: number;
}

function toEnu(p: LatLon, ref: LatLon): Point2D {
    const dLatRad = (p.lat - ref.lat) * DEG_TO_RAD;
    const dLonRad = (p.lon - ref.lon) * DEG_TO_RAD;
    const cosLat0 = Math.cos(ref.lat * DEG_TO_RAD);
    return {
        e: EARTH_RADIUS_KM * cosLat0 * dLonRad,
        n: EARTH_RADIUS_KM * dLatRad,
    };
}

function fromEnu(p: Point2D, ref: LatLon): LatLon {
    const dLatRad = p.n / EARTH_RADIUS_KM;
    const cosLat0 = Math.cos(ref.lat * DEG_TO_RAD);
    const dLonRad = cosLat0 === 0 ? 0 : p.e / (EARTH_RADIUS_KM * cosLat0);
    return {
        lat: ref.lat + dLatRad * RAD_TO_DEG,
        lon: ref.lon + dLonRad * RAD_TO_DEG,
    };
}

export interface SegmentIntersection {
    intersects: boolean;
    fractionA: number;
    point: LatLon;
}

export function segmentsIntersect(
    a1: LatLon,
    a2: LatLon,
    b1: LatLon,
    b2: LatLon,
): SegmentIntersection | null {
    const ref: LatLon = {
        lat: (b1.lat + b2.lat) / 2,
        lon: (b1.lon + b2.lon) / 2,
    };
    const pa1 = toEnu(a1, ref);
    const pa2 = toEnu(a2, ref);
    const pb1 = toEnu(b1, ref);
    const pb2 = toEnu(b2, ref);

    const rx = pa2.e - pa1.e;
    const ry = pa2.n - pa1.n;
    const sx = pb2.e - pb1.e;
    const sy = pb2.n - pb1.n;

    const denom = rx * sy - ry * sx;
    if (Math.abs(denom) < 1e-12) return null;

    const dx = pb1.e - pa1.e;
    const dy = pb1.n - pa1.n;
    const t = (dx * sy - dy * sx) / denom;
    const u = (dx * ry - dy * rx) / denom;

    if (t < 0 || t > 1 || u < 0 || u > 1) {
        return { intersects: false, fractionA: t, point: a1 };
    }

    const crossEnu: Point2D = {
        e: pa1.e + t * rx,
        n: pa1.n + t * ry,
    };
    return {
        intersects: true,
        fractionA: t,
        point: fromEnu(crossEnu, ref),
    };
}

export function crossingDirection(
    prev: LatLon,
    curr: LatLon,
    gateA: LatLon,
    gateB: LatLon,
): CrossingDirection {
    const ref: LatLon = {
        lat: (gateA.lat + gateB.lat) / 2,
        lon: (gateA.lon + gateB.lon) / 2,
    };
    const ga = toEnu(gateA, ref);
    const gb = toEnu(gateB, ref);
    const gp = toEnu(prev, ref);
    const gc = toEnu(curr, ref);

    const gateVecE = gb.e - ga.e;
    const gateVecN = gb.n - ga.n;
    const signPrev = gateVecE * (gp.n - ga.n) - gateVecN * (gp.e - ga.e);
    const signCurr = gateVecE * (gc.n - ga.n) - gateVecN * (gc.e - ga.e);

    if (signPrev >= 0 && signCurr < 0) return 'left-to-right';
    return 'right-to-left';
}

export function isNearPole(
    vertices: LatLon[],
    limit: number = POLE_LATITUDE_LIMIT,
): boolean {
    return vertices.some((v) => Math.abs(v.lat) > limit);
}

export function crossesAntimeridian(vertices: LatLon[]): boolean {
    for (let i = 1; i < vertices.length; i++) {
        if (Math.abs(vertices[i].lon - vertices[i - 1].lon) > 180) return true;
    }
    return false;
}

export interface SegmentLengthInfo {
    index: number;
    km: number;
    tooLong: boolean;
}

export function measureSegments(
    vertices: LatLon[],
    maxKm: number = MAX_SEGMENT_KM,
): SegmentLengthInfo[] {
    const out: SegmentLengthInfo[] = [];
    for (let i = 1; i < vertices.length; i++) {
        const km = haversineKm(vertices[i - 1], vertices[i]);
        out.push({ index: i - 1, km, tooLong: km > maxKm });
    }
    return out;
}

export function autoSplitSegments(
    vertices: LatLon[],
    maxKm: number = MAX_SEGMENT_KM,
): LatLon[] {
    if (vertices.length < 2) return vertices;
    const out: LatLon[] = [vertices[0]];
    for (let i = 1; i < vertices.length; i++) {
        const a = vertices[i - 1];
        const b = vertices[i];
        const km = haversineKm(a, b);
        if (km <= maxKm) {
            out.push(b);
        } else {
            const n = Math.ceil(km / maxKm);
            for (let k = 1; k <= n; k++) {
                const t = k / n;
                out.push({
                    lat: a.lat + (b.lat - a.lat) * t,
                    lon: a.lon + (b.lon - a.lon) * t,
                });
            }
        }
    }
    return out;
}
