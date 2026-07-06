// Sentralt ikon-atlas for ALLE primitive-renderere (jf.
// docs/ARCHITECTURE-VISION.md: «ett ikon-atlas»). Atlaset må bygges ÉN gang med
// unionen av alle lags ikonspecs — bygger man det med kun ett lags ikoner (den
// som attacher først), mangler de andre subregionene. Derfor samles specs her.

import { iconAtlas, type AtlasIconSpec } from '@/render/IconAtlas';
import { flightAtlasSpecs } from '@/render/flightIcons';
import { shipAtlasSpecs } from '@/render/shipIcons';
import { POINT_LAYER_CONFIGS } from '@/data/channels/pointConfigs';

/** Stabil image-id for atlas-canvasen (samme for alle billboards). */
export const ATLAS_IMAGE_ID = 'worldview-atlas';

/** Unionen av alle kjente ikonspecs (fly + alle punktlag). */
export function allAtlasSpecs(): AtlasIconSpec[] {
    const specs: AtlasIconSpec[] = [...flightAtlasSpecs(), ...shipAtlasSpecs()];
    for (const config of POINT_LAYER_CONFIGS) specs.push(...config.atlasSpecs());
    return specs;
}

/** Bygg atlaset én gang med hele unionen. Idempotent. */
export function ensureSharedAtlas(): void {
    if (!iconAtlas.isBuilt) iconAtlas.build(allAtlasSpecs());
}
