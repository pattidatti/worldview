// Scener/presets (jf. docs/ARCHITECTURE-VISION.md, Fase E): kuraterte
// utgangspunkt i stedet for 35 rå-toggles. Hver scene = lagkombinasjon +
// kamerastart + valgfri shader. «Det største enkeltgrepet for opplevd eleganse:
// appen åpner med et vakkert, meningsfullt bilde i stedet for et tomt kart.»

import type { LayerId } from '@/types/layers';
import type { ShaderOverlayMode } from '@/types/shaderOverlay';

export interface Scene {
    id: string;
    label: string;
    icon: string;
    description: string;
    /** Lag som slås PÅ (alt annet av, unntatt gates). */
    layers: LayerId[];
    /** Kamerastart. */
    camera: { lon: number; lat: number; height: number };
    /** Valgfri signatur-shader (default 'none'). */
    shader?: ShaderOverlayMode;
}

export const SCENES: Scene[] = [
    {
        id: 'maritim',
        label: 'Maritim',
        icon: '⚓',
        description: 'Skipstrafikk, havner, fyrtårn og sjøkabler i Nordsjøen',
        layers: ['ships', 'harbors', 'lighthouses', 'submarineCables', 'chokepoints'],
        camera: { lon: 3, lat: 57, height: 2_200_000 },
    },
    {
        id: 'luftrom',
        label: 'Luftrom',
        icon: '✈',
        description: 'Flytrafikk, luftromsadvarsler og GPS-forstyrrelser over Europa',
        layers: ['flights', 'sigmet', 'gpsjam'],
        camera: { lon: 10, lat: 50, height: 3_500_000 },
    },
    {
        id: 'geopolitikk',
        label: 'Geopolitikk',
        icon: '⚔',
        description: 'Konflikter, nyheter og spenningsnivå — termisk nattbilde',
        layers: ['conflicts', 'news', 'tension'],
        camera: { lon: 30, lat: 32, height: 6_500_000 },
        shader: 'thermal',
    },
    {
        id: 'natur',
        label: 'Natur',
        icon: '🌋',
        description: 'Jordskjelv, naturkatastrofer, vulkaner, værradar og lyn',
        layers: ['earthquakes', 'disasters', 'volcanoes', 'weatherRadar', 'lightning'],
        camera: { lon: 130, lat: 5, height: 18_000_000 },
    },
    {
        id: 'infrastruktur',
        label: 'Infrastruktur',
        icon: '⚡',
        description: 'Kraftnett, installasjoner, olje/gass-felt og vindturbiner',
        layers: ['power', 'infrastructure', 'infrastructureFields', 'infrastructurePipelines', 'wind'],
        camera: { lon: 7, lat: 60, height: 1_800_000 },
    },
    {
        id: 'rom',
        label: 'Rom',
        icon: '🛰',
        description: 'Satellitter, romstasjonen, asteroider og rakettoppskytinger',
        layers: ['satellites', 'iss', 'asteroids', 'launches'],
        camera: { lon: 0, lat: 20, height: 26_000_000 },
    },
];

/** Åpningsscene ved aller første besøk (ingen lagret synlighet). */
export const OPENING_SCENE_ID = 'maritim';
