// Delt protokoll for de forente punktlagene (jf. docs/ARCHITECTURE-VISION.md,
// Fase D). Ti tidligere Entity-baserte lag (earthquakes, disasters, volcanoes,
// launches, conflicts, news, …) blir konfigurasjon på én felles PointChannel +
// PointRenderer i stedet for hver sin komponent. DOM-/Cesium-fri.

import type { AtlasIconSpec } from '@/render/IconAtlas';
import type { Viewport } from '@/core/ViewportService';
import type { PopupContent } from '@/types/popup';
import type { TooltipContent } from '@/types/tooltip';
import type { GeointLayerData } from '@/types/geoint';
import type { LayerId } from '@/types/layers';

/**
 * Normalisert punkt-entitet i storen. Rendereren trenger kun id + posisjon +
 * stil; det opprinnelige domeneobjektet bæres med i `source` for popup/tooltip/
 * GEOINT-byggere (unngår et parallelt oppslag).
 */
export interface PointEntity<T = unknown> {
    id: string;
    lat: number;
    lon: number;
    /** Meter over bakken; default 0 (klemmes til terreng). */
    alt: number;
    /** Atlas-ikon-id (subregion i det delte ikon-atlaset). */
    iconId: string;
    /** CSS-farge for billboard-tinting + pulse-ring + klyngeikon. */
    color: string;
    /** Ikonstørrelse i px (default 32). */
    sizePx: number;
    /** Skal en pulse-ring spawnes når denne entiteten dukker opp (ikke førstelast). */
    pulse: boolean;
    /** Opprinnelig domeneobjekt — for popup/tooltip/GEOINT. */
    source: T;
}

/**
 * Deklarativ konfigurasjon per punktlag. Erstatter en hel React-komponent:
 * ett objekt beskriver kilde, ikonografi, klustring, LOD og byggere.
 */
export interface PointLayerConfig<T> {
    /** layerStore-id (== channel-id == pick-prefiks-rot). */
    layerId: LayerId;
    /** Menneskelesbart navn (GEOINT-etikett). */
    label: string;
    /** Markørgeometri: atlas-ikon (billboard) eller farget punkt. */
    mode: 'billboard' | 'point';
    /** Hent rådata. Viewport er null for globale kilder. */
    fetch: (viewport: Viewport | null, signal: AbortSignal) => Promise<T[]>;
    pollMs: number;
    /** Refetch ved viewport-endring (default false — de fleste punktkilder er globale). */
    viewportAware?: boolean;
    startupJitterMs?: number;
    /** Stabil id per objekt. */
    getId: (item: T) => string;
    getPosition: (item: T) => { lat: number; lon: number; alt?: number };
    getStyle: (item: T) => { iconId: string; color: string; sizePx?: number };
    /** Atlas-ikoner dette laget bidrar med (tegnes inn i det delte atlaset). */
    atlasSpecs: () => AtlasIconSpec[];
    /** Skru på klyngemodus (tetthetsceller ved GLOBAL-tier). */
    clustered?: boolean;
    /** Farge for tetthetsceller når `clustered` (default første objekts farge). */
    clusterColor?: string;
    /** Spawn pulse-ring når nye entiteter ankommer (ikke ved førstelast). */
    pulse?: boolean;
    buildPopup: (item: T) => PopupContent | null;
    buildTooltip: (item: T) => TooltipContent | null;
    buildGeoint?: (items: T[]) => GeointLayerData | null;
}

/** Map et rå-domeneobjekt til en normalisert PointEntity via konfig. */
export function toPointEntity<T>(config: PointLayerConfig<T>, item: T): PointEntity<T> {
    const pos = config.getPosition(item);
    const style = config.getStyle(item);
    return {
        id: config.getId(item),
        lat: pos.lat,
        lon: pos.lon,
        alt: pos.alt ?? 0,
        iconId: style.iconId,
        color: style.color,
        sizePx: style.sizePx ?? 32,
        pulse: config.pulse ?? false,
        source: item,
    };
}
