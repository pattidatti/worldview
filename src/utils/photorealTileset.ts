import { Cesium3DTileset, GoogleMaps, createGooglePhotorealistic3DTileset } from 'cesium';
import { applyTilesetPerformanceTuning } from './tilesetPerformance';

/**
 * Google Photorealistic 3D Tiles kan hentes to veier:
 *
 *  - `google`: direkte mot Google Map Tiles API med egen nøkkel
 *    (`VITE_GOOGLE_MAPS_API_KEY`). Kvoten og faktureringen ligger på din egen
 *    Google Cloud-konto, uavhengig av Cesium Ion. Dette er den foretrukne
 *    veien — Ion-ruten deler kvote med alt annet Ion-innhold.
 *  - `ion`: Cesium Ion asset 2275207. Krever at asseten er lagt til i
 *    Ion-kontoen (ion.cesium.com/assetdepot) og bruker Ion-kvoten.
 *
 * Vi prøver `google` først og faller tilbake til `ion`. Feiler begge kastes en
 * `PhotorealUnavailableError` med en norsk årsak som kan vises i UI-et.
 *
 * ⚠️ Google Maps Platform sine vilkår krever at Photorealistic 3D Tiles vises
 * med Googles egen geokoder. WorldView bruker OSM Nominatim (`geocoding.ts`),
 * så vi sender bevisst IKKE `onlyUsingWithGoogleGeocoder: true` — det flagget
 * er en bekreftelse på noe vi ikke oppfyller. Cesium logger derfor én
 * engangsadvarsel i konsollen. Se CLAUDE.md.
 */

const GOOGLE_PHOTOREAL_ION_ASSET = 2275207;

export type PhotorealSource = 'google' | 'ion';

export interface PhotorealTilesetResult {
    tileset: Cesium3DTileset;
    source: PhotorealSource;
}

export class PhotorealUnavailableError extends Error {
    readonly causes: string[];

    constructor(causes: string[]) {
        super(causes.join(' · '));
        this.name = 'PhotorealUnavailableError';
        this.causes = causes;
    }
}

function googleApiKey(): string {
    return (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
}

function ionToken(): string {
    return (import.meta.env.VITE_CESIUM_ION_TOKEN || '').trim();
}

/** True når minst én av de to rutene har en nøkkel konfigurert. */
export function isPhotorealConfigured(): boolean {
    return !!googleApiKey() || !!ionToken();
}

/**
 * Lager tileset for Google Photorealistic 3D Tiles. Kaller
 * `applyTilesetPerformanceTuning` før tilsettet returneres, slik at
 * innstillingene er på plass før første frame.
 */
export async function createPhotorealTileset(): Promise<PhotorealTilesetResult> {
    const causes: string[] = [];
    const key = googleApiKey();

    if (key) {
        try {
            GoogleMaps.defaultApiKey = key;
            const tileset = await createGooglePhotorealistic3DTileset();
            applyTilesetPerformanceTuning(tileset);
            return { tileset, source: 'google' };
        } catch (e) {
            causes.push(`Google Map Tiles API avviste nøkkelen (${describe(e)})`);
        }
    } else {
        causes.push('VITE_GOOGLE_MAPS_API_KEY mangler');
    }

    if (ionToken()) {
        try {
            const tileset = await Cesium3DTileset.fromIonAssetId(GOOGLE_PHOTOREAL_ION_ASSET);
            applyTilesetPerformanceTuning(tileset);
            return { tileset, source: 'ion' };
        } catch (e) {
            causes.push(
                `Cesium Ion asset ${GOOGLE_PHOTOREAL_ION_ASSET} utilgjengelig — ` +
                `legg den til på ion.cesium.com/assetdepot (${describe(e)})`
            );
        }
    } else {
        causes.push('VITE_CESIUM_ION_TOKEN mangler');
    }

    throw new PhotorealUnavailableError(causes);
}

function describe(e: unknown): string {
    if (e instanceof Error && e.message.trim()) return e.message.trim();
    return String(e);
}
