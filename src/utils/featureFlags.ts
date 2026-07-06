// Feature-flagg for migreringen til renderplan-arkitekturen (fase B+).
// Prioritet: URL-param > localStorage > env > default. Flagget evalueres én
// gang per sidelast — bytte krever reload (bevisst: lag-bytte midt i en sesjon
// gir blandede datasources).

const FLIGHTS_V2_STORAGE_KEY = 'worldview.flightsV2';

function readFlag(
    param: string,
    storageKey: string,
    envValue: string | undefined,
    defaultValue: boolean,
): boolean {
    try {
        const url = new URLSearchParams(window.location.search).get(param);
        if (url === '1') return true;
        if (url === '0') return false;
        const stored = localStorage.getItem(storageKey);
        if (stored === '1') return true;
        if (stored === '0') return false;
    } catch {
        // SSR/testmiljø uten window — fall til env/default
    }
    if (envValue === '1') return true;
    if (envValue === '0') return false;
    return defaultValue;
}

/**
 * FlightLayerV2: kanal + primitive-renderer i stedet for Entity-laget.
 * Default PÅ (Fase B utrullet). Escape-hatch tilbake til legacy V1:
 * `?flights2=0`, localStorage `worldview.flightsV2 = '0'`, eller `VITE_FLIGHTS_V2=0`.
 */
export function isFlightsV2Enabled(): boolean {
    return readFlag('flights2', FLIGHTS_V2_STORAGE_KEY, import.meta.env.VITE_FLIGHTS_V2, true);
}

/** Syntetisk 2000-flys last for deterministisk ytelsestesting. Krever flights2. */
export function isFlightsMockEnabled(): boolean {
    try {
        return new URLSearchParams(window.location.search).get('flightsMock') === '1';
    } catch {
        return false;
    }
}
