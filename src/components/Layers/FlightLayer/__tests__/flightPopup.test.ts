// Parity-vakt for popup-/tooltip-innholdet som FlightLayerV2 gjenbruker fra
// legacy-laget. Sikrer at felter, enhetskonvertering, militær-styling og
// followEntityId ikke driver fra hverandre under Fase B-utrullingen.

import { describe, it, expect } from 'vitest';
import type { Flight } from '@/types/flight';
import { buildFlightPopup, buildFlightTooltip, getFlightColor } from '../flightPopup';

function makeFlight(overrides: Partial<Flight> = {}): Flight {
    return {
        icao24: '4ca7b3',
        callsign: 'SAS1234',
        originCountry: 'Norway',
        lon: 10.75,
        lat: 59.91,
        altitude: 10668, // 35 000 ft
        velocity: 250, // ~486 kts
        heading: 90,
        verticalRate: 0,
        onGround: false,
        positionSource: 0,
        isMilitary: false,
        ...overrides,
    };
}

describe('buildFlightPopup', () => {
    it('bygger sivil popup med rett tittel, ikon, følge-id og enhetskonvertering', () => {
        const popup = buildFlightPopup(makeFlight());
        expect(popup.title).toBe('SAS1234');
        expect(popup.icon).toBe('✈');
        expect(popup.followEntityId).toBe('4ca7b3');
        // 10668 m → 35000 ft (avrundet); 250 m/s → 486 kts
        const alt = popup.fields.find((f) => f.label === 'Høyde');
        const speed = popup.fields.find((f) => f.label === 'Hastighet');
        const heading = popup.fields.find((f) => f.label === 'Kurs');
        expect(alt?.value).toBe((35000).toLocaleString('nb-NO'));
        expect(speed?.value).toBe(486);
        expect(heading?.value).toBe('90°');
        // SAS-callsign → airline-logo
        expect(popup.imageUrl).toContain('/SK.png');
    });

    it('bruker militær-styling og -beskrivelse for militærfly', () => {
        const popup = buildFlightPopup(makeFlight({ isMilitary: true, callsign: 'RCH123' }));
        expect(popup.icon).toBe('🪖');
        expect(popup.color).toBe(getFlightColor(makeFlight({ isMilitary: true })));
        expect(popup.description).toContain('Militærfly');
    });

    it('faller tilbake til icao24 som tittel når callsign mangler', () => {
        const popup = buildFlightPopup(makeFlight({ callsign: '' }));
        expect(popup.title).toBe('4ca7b3');
    });
});

describe('buildFlightTooltip', () => {
    it('viser høyde og fart i subtittel', () => {
        const tip = buildFlightTooltip(makeFlight());
        expect(tip.title).toBe('SAS1234');
        expect(tip.subtitle).toContain('ft');
        expect(tip.subtitle).toContain('kts');
    });
});
