// Ett ikon-atlas for primitive-renderere (jf. docs/ARCHITECTURE-VISION.md):
// alle ikonvarianter tegnes inn i ÉN canvas ved oppstart, og billboards
// refererer subregioner via imageSubRegion. Erstatter per-ikon data-URI-SVGer
// slik at GPU-batching fungerer (én tekstur per collection).

export interface AtlasIconSpec {
    /** F.eks. 'plane:default', 'plane:military', 'dot:glow'. */
    id: string;
    /** Kvadratisk cellestørrelse i px. */
    size: number;
    /** Tegn ikonet i [0, size]²-koordinater; ctx er ferdig translatert til cellen. */
    draw: (ctx: CanvasRenderingContext2D, size: number) => void;
}

export interface AtlasRegion {
    x: number;
    y: number;
    width: number;
    height: number;
    /** y målt fra BUNNEN av canvasen — formatet Cesiums imageSubRegion bruker. */
    yFromBottom: number;
}

export interface AtlasLayout {
    /** Kvadratisk canvas-side (potens av 2). */
    canvasSize: number;
    cells: Map<string, AtlasRegion>;
}

function nextPowerOfTwo(n: number): number {
    let p = 1;
    while (p < n) p *= 2;
    return p;
}

/**
 * Grid-pakking: uniforme celler på størrelse med største ikon, kvadratisk
 * rutenett, potens-av-2 canvas. Ren funksjon — testbar uten DOM.
 */
export function computeAtlasLayout(specs: readonly AtlasIconSpec[]): AtlasLayout {
    if (specs.length === 0) return { canvasSize: 0, cells: new Map() };
    let cell = 0;
    for (const spec of specs) cell = Math.max(cell, spec.size);
    const cols = Math.ceil(Math.sqrt(specs.length));
    const rows = Math.ceil(specs.length / cols);
    const canvasSize = nextPowerOfTwo(Math.max(cols, rows) * cell);

    const cells = new Map<string, AtlasRegion>();
    specs.forEach((spec, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col * cell;
        const y = row * cell;
        cells.set(spec.id, {
            x,
            y,
            width: spec.size,
            height: spec.size,
            yFromBottom: canvasSize - y - spec.size,
        });
    });
    return { canvasSize, cells };
}

export class IconAtlas {
    private layout: AtlasLayout = { canvasSize: 0, cells: new Map() };
    private _canvas: HTMLCanvasElement | null = null;

    /** Canvasen som settes som Billboard.image — én tekstur for alle ikoner. */
    get canvas(): HTMLCanvasElement {
        if (!this._canvas) throw new Error('IconAtlas.build() er ikke kalt');
        return this._canvas;
    }

    get isBuilt(): boolean {
        return this._canvas !== null;
    }

    /** Tegn alle specs inn i én canvas. Kalles én gang ved oppstart (re-kall bygger nytt). */
    build(specs: readonly AtlasIconSpec[]): void {
        this.layout = computeAtlasLayout(specs);
        const canvas = document.createElement('canvas');
        canvas.width = this.layout.canvasSize;
        canvas.height = this.layout.canvasSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Fikk ikke 2d-context for ikon-atlas');
        for (const spec of specs) {
            const region = this.layout.cells.get(spec.id)!;
            ctx.save();
            ctx.translate(region.x, region.y);
            spec.draw(ctx, spec.size);
            ctx.restore();
        }
        this._canvas = canvas;
    }

    has(id: string): boolean {
        return this.layout.cells.has(id);
    }

    /** Region i px; yFromBottom brukes direkte i Cesiums BoundingRectangle. */
    getRegion(id: string): AtlasRegion {
        const region = this.layout.cells.get(id);
        if (!region) throw new Error(`Ukjent atlas-ikon: ${id}`);
        return region;
    }
}

export const iconAtlas = new IconAtlas();

/**
 * Les en CSS-variabel fra :root (fargesystemets eneste kilde, src/index.css).
 * Fallback for miljøer uten DOM (tester, workers).
 */
export function readCssColor(varName: string, fallback: string): string {
    if (typeof document === 'undefined') return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return value || fallback;
}
