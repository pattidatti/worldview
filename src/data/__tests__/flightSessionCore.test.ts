import { describe, it, expect } from 'vitest';
import { FlightSessionCore } from '../channels/flightSessionCore';
import {
    FLIGHT_BUFFER_LAYOUT,
    FLIGHT_FLAG_MILITARY,
    FLIGHT_FLAG_ON_GROUND,
    FLIGHT_FLAG_STALE,
    type FlightEntity,
} from '../channels/flightProtocol';
import { DR_MAX_AGE_MS } from '@/utils/flightKinematics';

function flight(id: string, overrides: Partial<FlightEntity> = {}): FlightEntity {
    return {
        id,
        icao24: id,
        callsign: `SK${id}`,
        originCountry: '',
        lon: 10,
        lat: 60,
        altitude: 10_000,
        velocity: 250,
        heading: 90,
        verticalRate: 0,
        onGround: false,
        positionSource: 0,
        isMilitary: false,
        ...overrides,
    };
}

const STRIDE = FLIGHT_BUFFER_LAYOUT.stride;

describe('FlightSessionCore.ingest', () => {
    it('første batch: alt er upserts, roster i innsettingsrekkefølge', () => {
        const core = new FlightSessionCore();
        const result = core.ingest([flight('a'), flight('b')], 1000);
        expect(result.upserts.map((u) => u.id)).toEqual(['a', 'b']);
        expect(result.removes).toEqual([]);
        expect(result.roster).toEqual(['a', 'b']);
        expect(core.size).toBe(2);
    });

    it('uendret fly gir ingen upsert; endret og fjernet fanges', () => {
        const core = new FlightSessionCore();
        core.ingest([flight('a'), flight('b'), flight('c')], 1000);
        const result = core.ingest([flight('a'), flight('b', { lat: 61 })], 2000);
        expect(result.upserts.map((u) => u.id)).toEqual(['b']);
        expect(result.removes).toEqual(['c']);
        expect(result.roster).toEqual(['a', 'b']);
    });
});

describe('FlightSessionCore.buildPositions', () => {
    it('fersk posisjon (< 100ms) ekstrapoleres ikke', () => {
        const core = new FlightSessionCore();
        core.ingest([flight('a')], 1000);
        const { buffer, moved } = core.buildPositions(1050);
        expect(buffer[0]).toBe(10);
        expect(buffer[1]).toBe(60);
        expect(moved).toBe(false);
    });

    it('fly i DR-vindu ekstrapoleres langs heading', () => {
        const core = new FlightSessionCore();
        core.ingest([flight('a', { heading: 90, velocity: 250 })], 1000);
        const { buffer, moved } = core.buildPositions(11_000); // 10s gammel
        expect(moved).toBe(true);
        expect(buffer[0]).toBeGreaterThan(10); // østover
        expect(buffer[1]).toBeCloseTo(60, 5);
        expect(buffer[3]).toBe(90);  // heading
        expect(buffer[4]).toBe(250); // velocity
        expect(buffer[5]).toBe(0);   // ingen flagg
    });

    it('eldre enn DR_MAX_AGE_MS: siste kjente posisjon + stale-flagg', () => {
        const core = new FlightSessionCore();
        core.ingest([flight('a')], 1000);
        const { buffer, moved } = core.buildPositions(1000 + DR_MAX_AGE_MS + 5000);
        expect(buffer[0]).toBe(10);
        expect(buffer[5]).toBe(FLIGHT_FLAG_STALE);
        expect(moved).toBe(false);
    });

    it('bakkefly ekstrapoleres ikke; flagg settes for bakke og militær', () => {
        const core = new FlightSessionCore();
        core.ingest(
            [
                flight('ground', { onGround: true }),
                flight('mil', { isMilitary: true, velocity: 0 }),
            ],
            1000,
        );
        const { buffer } = core.buildPositions(6000);
        expect(buffer[0 * STRIDE + 5]).toBe(FLIGHT_FLAG_ON_GROUND);
        expect(buffer[0 * STRIDE]).toBe(10); // ikke flyttet
        expect(buffer[1 * STRIDE + 5]).toBe(FLIGHT_FLAG_MILITARY);
    });

    it('gjenbruker buffer med riktig størrelse, allokerer ved roster-endring', () => {
        const core = new FlightSessionCore();
        core.ingest([flight('a'), flight('b')], 1000);
        const first = core.buildPositions(2000).buffer;
        const second = core.buildPositions(3000, first).buffer;
        expect(second).toBe(first); // ping-pong-gjenbruk

        core.ingest([flight('a')], 4000);
        const third = core.buildPositions(5000, first).buffer;
        expect(third).not.toBe(first);
        expect(third.length).toBe(1 * STRIDE);
    });

    it('slot-rekkefølge følger roster', () => {
        const core = new FlightSessionCore();
        core.ingest([flight('a', { lat: 50 }), flight('b', { lat: 70 })], 1000);
        const { buffer } = core.buildPositions(1000);
        const roster = core.getRoster();
        expect(roster).toEqual(['a', 'b']);
        expect(buffer[0 * STRIDE + 1]).toBe(50);
        expect(buffer[1 * STRIDE + 1]).toBe(70);
    });
});
