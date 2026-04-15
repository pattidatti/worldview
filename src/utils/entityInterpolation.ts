// Lineær interpolasjon av entity-posisjoner mellom to buckets.
// Brukes i replay-modus for å gi myk bevegelse mellom 5/10-min snapshots.

import type { ReplayBucket, ReplayFlight, ReplayItem, ReplayShip } from '@/types/replay';

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

// Bearing interpoleres med shortest-arc (wrap via 360°).
function lerpBearing(a: number, b: number, t: number): number {
    let d = b - a;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    let r = a + d * t;
    if (r < 0) r += 360;
    if (r >= 360) r -= 360;
    return r;
}

function indexById<T extends ReplayItem>(items: T[], keyFn: (x: T) => string): Map<string, T> {
    const m = new Map<string, T>();
    for (const it of items) m.set(keyFn(it), it);
    return m;
}

function flightKey(f: ReplayFlight): string {
    return f.icao24;
}

function shipKey(s: ReplayShip): string {
    return String(s.mmsi);
}

// Interpoler flights: entiteter som er i BÅDE prev og next lerpes.
// Kun-prev / kun-next beholdes for "fade"-oppførsel i lag-koden.
export function interpolateFlights(
    prev: ReplayBucket<ReplayFlight>,
    next: ReplayBucket<ReplayFlight>,
    cursorTs: number,
): ReplayFlight[] {
    const dt = next.ts - prev.ts;
    if (dt <= 0) return next.items;
    const t = Math.max(0, Math.min(1, (cursorTs - prev.ts) / dt));

    const prevMap = indexById(prev.items, flightKey);
    const nextMap = indexById(next.items, flightKey);
    const all = new Set<string>([...prevMap.keys(), ...nextMap.keys()]);

    const out: ReplayFlight[] = [];
    for (const id of all) {
        const p = prevMap.get(id);
        const n = nextMap.get(id);
        if (p && n) {
            out.push({
                ...n,
                lat: lerp(p.lat, n.lat, t),
                lon: lerp(p.lon, n.lon, t),
                altitude: lerp(p.altitude, n.altitude, t),
                velocity: lerp(p.velocity, n.velocity, t),
                heading: lerpBearing(p.heading, n.heading, t),
                verticalRate: lerp(p.verticalRate, n.verticalRate, t),
            });
        } else if (p && !n) {
            // Kun i prev: fading ut — vis på prev-posisjon.
            out.push(p);
        } else if (n) {
            // Kun i next: fading inn — vis på next-posisjon.
            out.push(n);
        }
    }
    return out;
}

export function interpolateShips(
    prev: ReplayBucket<ReplayShip>,
    next: ReplayBucket<ReplayShip>,
    cursorTs: number,
): ReplayShip[] {
    const dt = next.ts - prev.ts;
    if (dt <= 0) return next.items;
    const t = Math.max(0, Math.min(1, (cursorTs - prev.ts) / dt));

    const prevMap = indexById(prev.items, shipKey);
    const nextMap = indexById(next.items, shipKey);
    const all = new Set<string>([...prevMap.keys(), ...nextMap.keys()]);

    const out: ReplayShip[] = [];
    for (const id of all) {
        const p = prevMap.get(id);
        const n = nextMap.get(id);
        if (p && n) {
            out.push({
                ...n,
                lat: lerp(p.lat, n.lat, t),
                lon: lerp(p.lon, n.lon, t),
                speed: lerp(p.speed, n.speed, t),
                course: lerpBearing(p.course, n.course, t),
                heading: lerpBearing(p.heading, n.heading, t),
            });
        } else if (p && !n) {
            out.push(p);
        } else if (n) {
            out.push(n);
        }
    }
    return out;
}
