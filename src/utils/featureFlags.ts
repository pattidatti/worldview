// Feature-flagg for renderplan-arkitekturen (fase B+).
// flights2-migreringsflagget er fjernet — FlightLayerV2 er nå eneste fly-sti.

/** Syntetisk 2000-flys last for deterministisk ytelsestesting. */
export function isFlightsMockEnabled(): boolean {
    try {
        return new URLSearchParams(window.location.search).get('flightsMock') === '1';
    } catch {
        return false;
    }
}
