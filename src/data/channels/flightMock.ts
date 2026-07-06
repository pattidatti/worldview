// Syntetisk flylast for deterministisk ytelsestesting (?flightsMock=1):
// 2000 fly over Europa med seeded posisjoner som beveger seg realistisk
// mellom polls. DOM-fri — brukes av channel-workeren og fallbacken.

import type { Flight } from '@/types/flight';
import { extrapolateGreatCircle } from '@/utils/flightKinematics';

export const MOCK_FLIGHT_COUNT = 2000;

/** Deterministisk LCG så hver sidelast gir samme flåte. */
function lcg(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0xffffffff;
    };
}

interface MockBase {
    icao24: string;
    lon0: number;
    lat0: number;
    heading: number;
    velocity: number;
    altitude: number;
    isMilitary: boolean;
}

let fleet: MockBase[] | null = null;

function buildFleet(): MockBase[] {
    const rand = lcg(0x5eed);
    const flights: MockBase[] = [];
    for (let i = 0; i < MOCK_FLIGHT_COUNT; i++) {
        flights.push({
            icao24: `mock${i.toString(16).padStart(4, '0')}`,
            lon0: -10 + rand() * 40,   // -10..30 Ø
            lat0: 45 + rand() * 25,    // 45..70 N
            heading: rand() * 360,
            velocity: 180 + rand() * 120,
            altitude: 6_000 + rand() * 6_000,
            isMilitary: rand() < 0.05,
        });
    }
    return flights;
}

/** Flåtens posisjoner `elapsedS` sekunder etter oppstart. */
export function generateMockFlights(elapsedS: number): Flight[] {
    if (!fleet) fleet = buildFleet();
    return fleet.map((base, i) => {
        const pos = extrapolateGreatCircle(base.lon0, base.lat0, base.heading, base.velocity, elapsedS);
        // Wrap innenfor gyldige koordinater — flåten flyr i ring i stedet for ut av kartet
        const lon = ((pos.lon + 180) % 360 + 360) % 360 - 180;
        const lat = Math.max(-85, Math.min(85, pos.lat));
        return {
            icao24: base.icao24,
            callsign: `MCK${i.toString().padStart(4, '0')}`,
            originCountry: '',
            lon,
            lat,
            altitude: base.altitude,
            velocity: base.velocity,
            heading: base.heading,
            verticalRate: 0,
            onGround: false,
            positionSource: 0 as const,
            isMilitary: base.isMilitary,
        };
    });
}
