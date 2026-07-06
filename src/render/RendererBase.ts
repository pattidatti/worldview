import type { Scene, Cartesian3 } from 'cesium';
import { renderScheduler } from '@/core/RenderScheduler';
import type { LODTier } from '@/core/LODGovernor';

/**
 * Renderplan-kontrakten (jf. docs/ARCHITECTURE-VISION.md): imperative
 * renderere som eier primitive-collections og abonnerer direkte på en
 * EntityStore — ingen React i loopen.
 */
export interface LayerRenderer {
    readonly id: string;
    attach(scene: Scene): void;
    detach(): void;
    setLOD(tier: LODTier): void;
    /** Posisjonsoppslag for kamera-tracking av primitives (GlobeViewer). */
    getPosition(id: string): Cartesian3 | null;
}

/**
 * Id-konvensjon for primitive-picking: `${kanal}:${entitetsId}` som string-id
 * på primitivet. pickRouter ruter på prefikset; EntityStore slås opp med
 * entitets-delen.
 */
export function primitiveId(channelId: string, entityId: string): string {
    return `${channelId}:${entityId}`;
}

export function parsePrimitiveId(pickedId: string): { channelId: string; entityId: string } | null {
    const sep = pickedId.indexOf(':');
    if (sep <= 0 || sep === pickedId.length - 1) return null;
    return { channelId: pickedId.slice(0, sep), entityId: pickedId.slice(sep + 1) };
}

function smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
}

/**
 * Alfa-fade for primitives via den delte animasjonsdriveren — motstykket til
 * entityFade for Entity-laget. Kalleren eier selve fargeskrivingen (Billboard-
 * color, PointPrimitive-color osv.); denne leverer easet alfa per tick.
 */
export function fadeAlpha(
    setAlpha: (alpha: number) => void,
    durationMs: number,
    direction: 'in' | 'out',
    onDone?: () => void,
): void {
    renderScheduler.animate({
        durationMs,
        onTick: (t) => {
            const eased = smoothstep(t);
            setAlpha(direction === 'in' ? eased : 1 - eased);
        },
        onDone,
    });
}
