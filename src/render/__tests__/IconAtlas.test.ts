import { describe, it, expect } from 'vitest';
import { computeAtlasLayout, type AtlasIconSpec } from '../IconAtlas';

const noop = () => {};

function spec(id: string, size: number): AtlasIconSpec {
    return { id, size, draw: noop };
}

describe('computeAtlasLayout', () => {
    it('tom spec-liste gir tom layout', () => {
        const layout = computeAtlasLayout([]);
        expect(layout.canvasSize).toBe(0);
        expect(layout.cells.size).toBe(0);
    });

    it('canvas er potens av 2 og rommer alle celler', () => {
        const specs = [spec('a', 48), spec('b', 48), spec('c', 48), spec('d', 48), spec('e', 48)];
        const layout = computeAtlasLayout(specs);
        // 5 ikoner → 3×2 grid à 48px → 144×96 → 256
        expect(layout.canvasSize).toBe(256);
        expect(layout.cells.size).toBe(5);
        for (const region of layout.cells.values()) {
            expect(region.x + region.width).toBeLessThanOrEqual(layout.canvasSize);
            expect(region.y + region.height).toBeLessThanOrEqual(layout.canvasSize);
        }
    });

    it('regioner overlapper ikke', () => {
        const specs = Array.from({ length: 9 }, (_, i) => spec(`icon-${i}`, 32));
        const layout = computeAtlasLayout(specs);
        const regions = [...layout.cells.values()];
        for (let i = 0; i < regions.length; i++) {
            for (let j = i + 1; j < regions.length; j++) {
                const a = regions[i];
                const b = regions[j];
                const disjoint =
                    a.x + a.width <= b.x ||
                    b.x + b.width <= a.x ||
                    a.y + a.height <= b.y ||
                    b.y + b.height <= a.y;
                expect(disjoint).toBe(true);
            }
        }
    });

    it('blandet størrelse: cellestørrelse følger største ikon', () => {
        const layout = computeAtlasLayout([spec('stor', 48), spec('liten', 32)]);
        const stor = layout.cells.get('stor')!;
        const liten = layout.cells.get('liten')!;
        expect(liten.x).toBe(48); // neste celle starter ved maks-størrelse
        expect(liten.width).toBe(32);
        expect(stor.width).toBe(48);
    });

    it('yFromBottom konverterer korrekt (Cesium imageSubRegion måler fra bunn)', () => {
        const specs = Array.from({ length: 4 }, (_, i) => spec(`i${i}`, 64));
        const layout = computeAtlasLayout(specs);
        // 2×2 grid à 64 → canvas 128
        expect(layout.canvasSize).toBe(128);
        const topLeft = layout.cells.get('i0')!;
        expect(topLeft.y).toBe(0);
        expect(topLeft.yFromBottom).toBe(64);
        const bottomLeft = layout.cells.get('i2')!;
        expect(bottomLeft.y).toBe(64);
        expect(bottomLeft.yFromBottom).toBe(0);
    });
});
