// Delt protokoll for ships-kanalen (Fase C). Ships har INGEN dead-reckoning
// (posisjoner endres kun ved AIS-batch hvert 5. s), så ingen posisjonsbuffer/
// worker — enklere enn flights. DOM-/Cesium-fri.

import type { Ship } from '@/types/ship';
import type { ReplayShip } from '@/types/replay';
import { SHIP_DARK_MS } from '@/utils/ship-utils';

/**
 * Ship med EntityStore-id (== String(mmsi)) og et tidsavledet `dark`-flagg.
 * `dark` er bakt inn slik at delta-diffen fanger overgangen når et skip slutter
 * å rapportere: AIS-heartbeaten (hvert 30. s) re-ingester uendret flåte, `dark`
 * flipper, og rendereren re-styler. Uten dette ville et skip aldri blitt rødt.
 */
export type ShipEntity = Ship & { id: string; dark: boolean };

export function toShipEntity(ship: Ship, now: number): ShipEntity {
    const dark = ship.lastSeen > 0 && (now - ship.lastSeen) > SHIP_DARK_MS;
    return { ...ship, id: String(ship.mmsi), dark };
}

/** ReplayShip → ShipEntity. ReplayShip mangler `lastSeen`; settes til cursor av kalleren. */
export function replayShipToShipEntity(replay: ReplayShip, lastSeen: number): ShipEntity {
    return { ...replay, lastSeen, id: String(replay.mmsi), dark: false };
}

export const SHIP_PICK_PREFIX = 'ships:';

/** AISStreamConnection batcher hvert 5. s — brukes som staleness-referanse. */
export const SHIP_BATCH_MS = 5_000;
export const SHIP_CROSSING_STALENESS_MS = 2 * SHIP_BATCH_MS;

export const MAX_SHIPS = 1000;
/** Fjern skip som ikke har rapportert på 60 min. */
export const SHIP_STALE_MS = 60 * 60 * 1000;
