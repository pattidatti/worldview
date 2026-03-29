import { type Flight } from '@/types/flight';
import { type Viewport } from '@/hooks/useViewport';

const OPENSKY_BASE = 'https://opensky-network.org/api';

export async function fetchFlights(viewport?: Viewport | null): Promise<Flight[]> {
    let url = `${OPENSKY_BASE}/states/all`;

    if (viewport) {
        const params = new URLSearchParams({
            lamin: String(Math.max(viewport.south, -90)),
            lamax: String(Math.min(viewport.north, 90)),
            lomin: String(Math.max(viewport.west, -180)),
            lomax: String(Math.min(viewport.east, 180)),
        });
        url += `?${params}`;
    }

    const response = await fetch(url);

    if (response.status === 429) {
        throw new Error('OpenSky rate limit — venter...');
    }

    if (!response.ok) {
        throw new Error(`OpenSky feil: ${response.status}`);
    }

    const data = await response.json();
    if (!data.states) return [];

    return data.states
        .filter((s: unknown[]) => s[5] != null && s[6] != null)
        .map((s: unknown[]): Flight => ({
            icao24: s[0] as string,
            callsign: ((s[1] as string) ?? '').trim(),
            originCountry: s[2] as string,
            lon: s[5] as number,
            lat: s[6] as number,
            altitude: (s[13] as number) ?? (s[7] as number) ?? 0,
            velocity: (s[9] as number) ?? 0,
            heading: (s[10] as number) ?? 0,
            verticalRate: (s[11] as number) ?? 0,
            onGround: s[8] as boolean,
        }));
}
