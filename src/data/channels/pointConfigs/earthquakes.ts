// Jordskjelvlag som konfig (Fase D). Tidligere EarthquakeLayer.tsx.
// PARITY-NOTE: bakke-skiven (EllipseGraphics i meter ∝ magnitude) er byttet mot
// et farget punkt (piksel-størrelse ∝ magnitude, farge ∝ dybde) — primitives har
// ingen billig per-objekt bakke-ellipse. Informasjonen (magnitude, dybde) er
// bevart; den geografiske «fotavtrykk»-skalaen er ikke. Se docs/POINT-PARITY.md.
import { fetchEarthquakes } from '@/services/usgs';
import type { Earthquake } from '@/types/earthquake';
import type { PointLayerConfig } from '@/data/channels/pointProtocol';
import { fetchWikiSummary } from '@/services/wikipedia';

// Dybde-farge (rgba, α0.85 for punkt-fyll): grunn=rød, middels=oransje, dyp=blå.
function depthColor(depth: number): string {
    if (depth < 30) return 'rgba(255,51,51,0.85)';
    if (depth < 100) return 'rgba(255,136,0,0.85)';
    return 'rgba(51,153,255,0.85)';
}

// Piksel-størrelse ∝ magnitude (M2.5 ≈ 13px, M8 ≈ 30px).
function magnitudeSize(mag: number): number {
    return Math.max(6, Math.min(6 + mag * 3, 40));
}

function extractPlace(place: string): string {
    const ofIdx = place.lastIndexOf(' of ');
    return ofIdx >= 0 ? place.slice(ofIdx + 4) : place;
}

function formatTime(ms: number): string {
    return new Date(ms).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' });
}

export const earthquakesConfig: PointLayerConfig<Earthquake> = {
    layerId: 'earthquakes',
    label: 'Jordskjelv',
    mode: 'point',
    pollMs: 5 * 60 * 1000,
    fetch: () => fetchEarthquakes(),
    getId: (q) => q.id,
    getPosition: (q) => ({ lat: q.lat, lon: q.lon }),
    getStyle: (q) => ({ iconId: '', color: depthColor(q.depth), sizePx: magnitudeSize(q.magnitude) }),
    atlasSpecs: () => [],
    buildPopup: (quake) => {
        const searchPlace = extractPlace(quake.place);
        return {
            title: quake.title,
            icon: '🌍',
            color: '#ff3333',
            linkUrl: quake.url,
            fields: [
                { label: 'Magnitude', value: quake.magnitude.toFixed(1) },
                { label: 'Sted', value: quake.place },
                { label: 'Dybde', value: quake.depth.toFixed(1), unit: 'km' },
                { label: 'Tid', value: formatTime(quake.time) },
            ],
            enrichAsync: async () => {
                const wiki = await fetchWikiSummary(searchPlace);
                if (!wiki?.extract) return {};
                return {
                    description: wiki.extract.length > 300 ? wiki.extract.slice(0, 297) + '...' : wiki.extract,
                    ...(wiki.thumbnailUrl ? { imageUrl: wiki.thumbnailUrl } : {}),
                };
            },
        };
    },
    buildTooltip: (quake) => ({
        title: `M${quake.magnitude.toFixed(1)} — ${quake.place}`,
        subtitle: `Dybde ${quake.depth.toFixed(0)} km`,
        icon: '🌍',
        color: '#ff3333',
    }),
    buildGeoint: (items) => {
        if (items.length === 0) return null;
        const sorted = [...items].sort((a, b) => b.magnitude - a.magnitude);
        const list = sorted.slice(0, 8).map((q) => `M${q.magnitude.toFixed(1)} ${q.place}, dybde ${q.depth.toFixed(0)}km`);
        return { layerId: 'earthquakes', label: 'Jordskjelv', count: items.length, items: list };
    },
};
