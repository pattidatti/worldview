// Flyikon-specs for ikon-atlaset — samme geometri som FlightLayers
// createPlaneIcon-SVG (48×48, peker nord; heading settes via
// billboard.rotation + alignedAxis), tegnet med Path2D i stedet for
// data-URI slik at alle varianter havner i én tekstur.

import { type AtlasIconSpec, readCssColor } from '@/render/IconAtlas';

const ICON_SIZE = 48;

// Path-data identisk med FlightLayer.tsx createPlaneIcon
const FUSELAGE = 'M24 2 C26 2 28 5 28 10 L28 38 C28 43 26 46 24 46 C22 46 20 43 20 38 L20 10 C20 5 22 2 24 2 Z';
const WING_L = 'M20 18 L4 32 L4 35 L20 26 Z';
const WING_R = 'M28 18 L44 32 L44 35 L28 26 Z';
const ENGINE_L = 'M9 28 C8 28 7 29.5 7 31 C7 32.5 8 34 9 34 L13 34 C14 34 15 32.5 15 31 C15 29.5 14 28 13 28 Z';
const ENGINE_R = 'M35 28 C34 28 33 29.5 33 31 C33 32.5 34 34 35 34 L39 34 C40 34 41 32.5 41 31 C41 29.5 40 28 39 28 Z';
const TAIL_L = 'M20 39 L11 44 L11 46 L20 43 Z';
const TAIL_R = 'M28 39 L37 44 L37 46 L28 43 Z';

function drawPlane(color: string): AtlasIconSpec['draw'] {
    return (ctx, size) => {
        const scale = size / ICON_SIZE;
        ctx.scale(scale, scale);
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = '#000';

        ctx.fillStyle = color;
        for (const d of [FUSELAGE, WING_L, WING_R, TAIL_L, TAIL_R]) {
            const path = new Path2D(d);
            ctx.fill(path);
            ctx.stroke(path);
        }
        ctx.fillStyle = '#222';
        for (const d of [ENGINE_L, ENGINE_R]) {
            const path = new Path2D(d);
            ctx.fill(path);
            ctx.stroke(path);
        }
    };
}

/** Myk glødende prikk — GLOBAL-tier tetthetsceller og punktmodus. */
function drawGlowDot(color: string): AtlasIconSpec['draw'] {
    return (ctx, size) => {
        const c = size / 2;
        const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
        gradient.addColorStop(0, color);
        gradient.addColorStop(0.5, color);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
    };
}

// Fargekilder: CSS-variabler der de finnes (--color-flights), ellers
// konstantene fra FlightLayer (SOURCE_COLORS/MILITARY_COLOR).
export const FLIGHT_ICON_IDS = {
    default: 'plane:default',     // ADS-B (== --color-flights oransje)
    asterix: 'plane:asterix',
    mlat: 'plane:mlat',
    flarm: 'plane:flarm',
    unknown: 'plane:unknown',
    military: 'plane:military',
    selected: 'plane:selected',
    glow: 'dot:glow',
} as const;

export function flightAtlasSpecs(): AtlasIconSpec[] {
    const flights = readCssColor('--color-flights', '#ffa500');
    return [
        { id: FLIGHT_ICON_IDS.default, size: ICON_SIZE, draw: drawPlane(flights) },
        { id: FLIGHT_ICON_IDS.asterix, size: ICON_SIZE, draw: drawPlane('#00d4ff') },
        { id: FLIGHT_ICON_IDS.mlat, size: ICON_SIZE, draw: drawPlane('#ffcc00') },
        { id: FLIGHT_ICON_IDS.flarm, size: ICON_SIZE, draw: drawPlane('#00ff88') },
        { id: FLIGHT_ICON_IDS.unknown, size: ICON_SIZE, draw: drawPlane('#888888') },
        { id: FLIGHT_ICON_IDS.military, size: ICON_SIZE, draw: drawPlane('#ff2244') },
        { id: FLIGHT_ICON_IDS.selected, size: ICON_SIZE, draw: drawPlane('#ffffff') },
        { id: FLIGHT_ICON_IDS.glow, size: 32, draw: drawGlowDot(flights) },
    ];
}

/** Atlas-ikon-id for et fly — speiler FlightLayers getFlightColor-logikk. */
export function flightIconId(flight: { isMilitary: boolean; positionSource: number }): string {
    if (flight.isMilitary) return FLIGHT_ICON_IDS.military;
    switch (flight.positionSource) {
        case 0: return FLIGHT_ICON_IDS.default;
        case 1: return FLIGHT_ICON_IDS.asterix;
        case 2: return FLIGHT_ICON_IDS.mlat;
        case 3: return FLIGHT_ICON_IDS.flarm;
        default: return FLIGHT_ICON_IDS.unknown;
    }
}
