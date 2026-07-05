import { describe, it, expect } from 'vitest';
import { replayFlightToFlightEntity, toFlightEntity } from '../channels/flightProtocol';
import type { ReplayFlight } from '@/types/replay';

const REPLAY: ReplayFlight = {
    icao24: 'abc123',
    callsign: 'SK123',
    lon: 10,
    lat: 60,
    altitude: 10_000,
    velocity: 250,
    heading: 90,
    verticalRate: 0,
    onGround: false,
    positionSource: 2,
    isMilitary: false,
};

describe('replayFlightToFlightEntity', () => {
    it('fyller originCountry og setter id = icao24', () => {
        const flight = replayFlightToFlightEntity(REPLAY);
        expect(flight.id).toBe('abc123');
        expect(flight.originCountry).toBe('');
        expect(flight.positionSource).toBe(2);
    });

    it('ukjent positionSource-tall faller tilbake til 0 (ADS-B)', () => {
        const flight = replayFlightToFlightEntity({ ...REPLAY, positionSource: 7 });
        expect(flight.positionSource).toBe(0);
    });
});

describe('toFlightEntity', () => {
    it('id speiler icao24', () => {
        const flight = toFlightEntity({ ...REPLAY, originCountry: 'NO', positionSource: 0 });
        expect(flight.id).toBe('abc123');
        expect(flight.originCountry).toBe('NO');
    });
});
