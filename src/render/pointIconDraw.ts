// Atlas-tegnehjelpere for de forente punktlagene (Fase D). Erstatter de per-lag
// genererte data-URI-SVGene med canvas-tegning inn i det delte ikon-atlaset —
// samme visuelle språk (farget ring + emoji-glyf), men GPU-batchbart.

import type { AtlasIconSpec } from '@/render/IconAtlas';

/** #rrggbb → rgba(...) med gitt alfa. Faller pent tilbake ved ugyldig hex. */
function withAlpha(hex: string, alpha: number): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return hex;
    const c = parseInt(m[1], 16);
    return `rgba(${(c >> 16) & 0xff}, ${(c >> 8) & 0xff}, ${c & 0xff}, ${alpha})`;
}

/**
 * En emoji-glyf i en farget, halvgjennomsiktig ring — samme uttrykk som
 * `createDisasterIcon`/`createVolcanoIcon`/`createLaunchIcon` gjorde per SVG.
 */
export function emojiRingSpec(
    id: string,
    emoji: string,
    ringColor: string,
    size = 32,
): AtlasIconSpec {
    return {
        id,
        size,
        draw: (ctx, s) => {
            const r = s / 2;
            ctx.beginPath();
            ctx.arc(r, r, r - 2, 0, Math.PI * 2);
            ctx.fillStyle = withAlpha(ringColor, 0.22);
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = ringColor;
            ctx.stroke();
            ctx.font = `${Math.round(s * 0.55)}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(emoji, r, r + s * 0.04);
        },
    };
}
