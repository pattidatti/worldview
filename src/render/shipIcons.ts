// Ship-ikon for atlaset (Fase C). Én nøytral skrog-silhuett (baug opp) som
// tintes per skipstype via billboard.color — erstatter de per-heading bakte
// data-URI-SVGene i createShipIconWithStatus (heading via billboard.rotation i
// stedet, jf. flylagets tilnærming). Se docs/SHIP-PARITY.md.

import { Color } from 'cesium';
import type { AtlasIconSpec } from '@/render/IconAtlas';
import { getShipColorCss } from '@/utils/ship-utils';

export const SHIP_ICON_ID = 'ship:hull';
export const SHIP_ICON_PX = 22;

/** Skrog-silhuett, baug opp (nord ved rotasjon 0), tegnet hvit for tinting. */
export function shipAtlasSpecs(): AtlasIconSpec[] {
    return [
        {
            id: SHIP_ICON_ID,
            size: 32,
            draw: (ctx) => {
                ctx.beginPath();
                ctx.moveTo(16, 3);
                ctx.lineTo(23, 12);
                ctx.lineTo(23, 27);
                ctx.lineTo(9, 27);
                ctx.lineTo(9, 12);
                ctx.closePath();
                ctx.fillStyle = 'rgba(255,255,255,0.95)';
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = 'rgba(10,20,30,0.9)';
                ctx.stroke();
                // Overbygnings-hint akter
                ctx.fillStyle = 'rgba(0,0,0,0.35)';
                ctx.fillRect(12, 19, 8, 6);
            },
        },
    ];
}

const DARK_TINT = Color.fromCssColorString('#ff2200');

/** Tint-farge for et skip: rød om mørkt, ellers skrogfargen fra skipstypen. */
export function shipTint(shipType: number, dark: boolean): Color {
    return dark ? DARK_TINT : Color.fromCssColorString(getShipColorCss(shipType));
}
