// Popup-/tooltip-innhold for fly — delt av FlightLayerV2 (id-basert oppslag i
// EntityStore). Samme innhold som legacy-lagets inline-buildere.

import type { Flight } from '@/types/flight';
import type { PopupContent } from '@/types/popup';
import type { TooltipContent } from '@/types/tooltip';
import { fetchFlightRoute, getCachedRoute } from '@/services/opensky';
import { lookupAirline } from '@/data/airlines';

const SOURCE_COLORS: Record<number, string> = {
    0: '#ffa500',
    1: '#00d4ff',
    2: '#ffcc00',
    3: '#00ff88',
};
const MILITARY_COLOR = '#ff2244';

export function getFlightColor(flight: Flight): string {
    if (flight.isMilitary) return MILITARY_COLOR;
    return SOURCE_COLORS[flight.positionSource] ?? '#888888';
}

export function buildFlightPopup(flight: Flight): PopupContent {
    const altFt = Math.round(flight.altitude * 3.28084);
    const altKft = Math.round(altFt / 1000);
    const speedKts = Math.round(flight.velocity * 1.94384);
    const callsign = flight.callsign;
    const color = getFlightColor(flight);
    const airline = lookupAirline(callsign ?? '');
    const cachedRoute = callsign ? getCachedRoute(callsign) : undefined;

    const buildDescription = (route?: { origin: string; destination: string }) => {
        const fra = route ? `fra ${route.origin} til ${route.destination}` : 'rute ukjent';
        const vertDesc =
            flight.verticalRate > 0.5 ? ', stiger' :
            flight.verticalRate < -0.5 ? ', synker' : '';
        const who = flight.isMilitary
            ? 'Militærfly'
            : airline?.name ?? callsign ?? flight.icao24;
        return `${who} flyr ${fra}. ${altKft} 000 fot, ${speedKts} knop${vertDesc}.`;
    };

    const baseFields = [
        { label: 'Høyde', value: altFt.toLocaleString('nb-NO'), unit: 'ft' },
        { label: 'Hastighet', value: speedKts, unit: 'kts' },
        { label: 'Kurs', value: `${Math.round(flight.heading)}°` },
        { label: 'Vertikal', value: flight.verticalRate.toFixed(1), unit: 'm/s' },
        ...(flight.aircraftType ? [{ label: 'Type', value: flight.aircraftType }] : []),
        { label: 'ICAO24', value: flight.icao24 },
    ];

    const routeFields = cachedRoute
        ? [{ label: 'Fra', value: cachedRoute.origin }, { label: 'Til', value: cachedRoute.destination }]
        : [];

    return {
        title: callsign || flight.icao24,
        icon: flight.isMilitary ? '🪖' : '✈',
        color,
        description: buildDescription(cachedRoute ?? undefined),
        imageUrl: airline ? `https://pics.avs.io/200/80/${airline.iataCode}.png` : undefined,
        followEntityId: flight.icao24,
        fields: [...routeFields, ...baseFields],
        enrichAsync: cachedRoute ? undefined : async () => {
            const route = await fetchFlightRoute(callsign ?? '');
            if (!route) return {};
            const newRouteFields = [
                { label: 'Fra', value: route.origin },
                { label: 'Til', value: route.destination },
            ];
            return {
                description: buildDescription(route),
                fields: [...newRouteFields, ...baseFields],
            };
        },
    };
}

export function buildFlightTooltip(flight: Flight): TooltipContent {
    return {
        title: flight.callsign || flight.icao24,
        subtitle: `${Math.round(flight.altitude * 3.28084).toLocaleString('nb-NO')} ft · ${Math.round(flight.velocity * 1.94384)} kts`,
        icon: flight.isMilitary ? '🪖' : '✈',
        color: getFlightColor(flight),
    };
}
