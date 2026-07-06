// Popup/tooltip-byggere for ships-laget (Fase C) — flyttet ut av det gamle
// inline-laget, uendret innhold. Tar en ShipEntity (id-basert oppslag i store)
// i stedet for en Cesium Entity.

import type { PopupContent } from '@/types/popup';
import type { TooltipContent } from '@/types/tooltip';
import {
    getShipTypeName,
    getNavStatusText,
    getNavStatusColor,
    getFlagState,
} from '@/utils/ship-utils';
import { checkSanctions } from '@/services/sanctions';
import type { ShipEntity } from '@/data/channels/shipProtocol';

export function buildShipPopup(ship: ShipEntity): PopupContent {
    const navText = getNavStatusText(ship.navStatus);
    const navColor = getNavStatusColor(ship.navStatus);
    const dims = ship.length && ship.width ? `${ship.length} × ${ship.width} m` : '';
    const isDark = ship.dark;
    const minutesDark = isDark ? Math.floor((Date.now() - ship.lastSeen) / 60_000) : 0;
    const popupColor = isDark ? '#ff2200' : (navColor ?? '#00d4ff');
    const baseFields = [
        ...(isDark ? [{ label: '⚠ MØRKT SKIP', value: `Signal mistet for ${minutesDark} min siden` }] : []),
        { label: 'Type', value: getShipTypeName(ship.shipType) },
        { label: 'Flagg', value: getFlagState(ship.mmsi) },
        ...(navText ? [{ label: 'Status', value: navText }] : []),
        { label: 'Hastighet', value: ship.speed.toFixed(1), unit: 'kn' },
        { label: 'Kurs', value: `${Math.round(ship.course)}°` },
        ...(dims ? [{ label: 'Størrelse', value: dims }] : []),
        ...(ship.draught ? [{ label: 'Dypgang', value: ship.draught.toFixed(1), unit: 'm' }] : []),
        ...(ship.callSign ? [{ label: 'Kallesignal', value: ship.callSign }] : []),
        ...(ship.imo ? [{ label: 'IMO', value: ship.imo }] : []),
        ...(ship.destination ? [{ label: 'Destinasjon', value: ship.destination }] : []),
        { label: 'MMSI', value: ship.mmsi },
    ];
    const capturedImo = ship.imo;
    return {
        title: ship.name || `MMSI ${ship.mmsi}`,
        icon: isDark ? '📵' : '⚓',
        color: popupColor,
        followEntityId: String(ship.mmsi),
        fields: baseFields,
        linkUrl: `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${ship.mmsi}`,
        linkLabel: 'Se på MarineTraffic →',
        enrichAsync: capturedImo ? async () => {
            const sanction = await checkSanctions(capturedImo);
            if (!sanction) return {};
            return {
                fields: [
                    { label: '🚫 OFAC SDN', value: sanction.name },
                    { label: 'Program', value: sanction.programs.slice(0, 2).join(', ') || 'Ukjent' },
                    ...(sanction.remarks ? [{ label: 'Merknad', value: sanction.remarks.slice(0, 120) }] : []),
                    ...baseFields,
                ],
            };
        } : undefined,
    };
}

export function buildShipTooltip(ship: ShipEntity): TooltipContent {
    return {
        title: ship.name || `MMSI ${ship.mmsi}`,
        subtitle: `${getShipTypeName(ship.shipType)} · ${ship.speed.toFixed(1)} kn`,
        icon: '⚓',
        color: '#00d4ff',
    };
}
