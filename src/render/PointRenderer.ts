// Felles primitive-renderer for de forente punktlagene (jf.
// docs/ARCHITECTURE-VISION.md, Fase D): én BillboardCollection ELLER én
// PointPrimitiveCollection per lag i stedet for Entity-per-objekt. Klustring
// erstattes av GLOBAL-tier tetthetsceller (primitives har ingen innebygd
// klustring), og pulse-ringer drives av den delte animasjonsdriveren.
//
// Konfigurert av PointLayerConfig — ti tidligere komponenter blir data, ikke
// kode. Rendereren abonnerer direkte på EntityStore; React-shimen (PointLayer)
// gjør kun synlighet/status/popup-kobling.

import {
    BillboardCollection,
    BoundingRectangle,
    Cartesian3,
    Color,
    HeightReference,
    HorizontalOrigin,
    PointPrimitiveCollection,
    VerticalOrigin,
    type Billboard,
    type PointPrimitive,
    type Scene,
} from 'cesium';
import { binToDensityCells } from '@/utils/densityGrid';
import { pickRouter } from '@/core/pickRouter';
import type { EntityStore, EntityDelta } from '@/core/EntityStore';
import { LODTier } from '@/core/LODGovernor';
import { renderScheduler } from '@/core/RenderScheduler';
import { fadeAlpha, primitiveId, type LayerRenderer } from '@/render/RendererBase';
import { ensureSharedAtlas, ATLAS_IMAGE_ID } from '@/render/atlasSpecs';
import { iconAtlas } from '@/render/IconAtlas';
import type { PointEntity, PointLayerConfig } from '@/data/channels/pointProtocol';

const FADE_IN_MS = 500;
const FADE_OUT_MS = 350;
const PULSE_MS = 1300;
const PULSE_MAX_PX = 44;
const DENSITY_CELL_DEG = 2;

const scratch = new Cartesian3();

export class PointRenderer<T> implements LayerRenderer {
    readonly id: string;

    private readonly store: EntityStore<PointEntity<T>>;
    private readonly config: PointLayerConfig<T>;
    private readonly mode: 'billboard' | 'point';

    private scene: Scene | null = null;
    private billboards: BillboardCollection | null = null;
    private points: PointPrimitiveCollection | null = null;
    private densityColl: PointPrimitiveCollection | null = null;
    private pulseColl: PointPrimitiveCollection | null = null;

    private markers = new Map<string, Billboard | PointPrimitive>();
    private fadingOut = new Set<string>();
    private densityCells = new Map<string, { lon: number; lat: number }>();
    private unsubscribes: (() => void)[] = [];
    private tier: LODTier = LODTier.REGION;
    private firstDeltaSeen = false;

    constructor(store: EntityStore<PointEntity<T>>, config: PointLayerConfig<T>, mode: 'billboard' | 'point') {
        this.store = store;
        this.config = config;
        this.mode = mode;
        this.id = config.layerId;
    }

    private get densityPrefix(): string {
        return `${this.id}:cell:`;
    }

    attach(scene: Scene): void {
        if (this.scene) return;
        ensureSharedAtlas();
        this.scene = scene;
        if (this.mode === 'billboard') {
            this.billboards = new BillboardCollection({ scene });
            scene.primitives.add(this.billboards);
        } else {
            this.points = new PointPrimitiveCollection();
            scene.primitives.add(this.points);
        }
        if (this.config.pulse) {
            this.pulseColl = new PointPrimitiveCollection();
            scene.primitives.add(this.pulseColl);
        }
        if (this.config.clustered) {
            this.densityColl = new PointPrimitiveCollection();
            scene.primitives.add(this.densityColl);
        }

        // Full resync mot storens nåværende innhold (uten fade/pulse)
        this.firstDeltaSeen = this.store.size > 0;
        for (const e of this.store.getAll().values()) this.upsert(e, false, false);
        this.unsubscribes = [
            this.store.subscribe((delta) => this.onDelta(delta)),
            pickRouter.register(this.densityPrefix, (pickedId) => this.onDensityPick(pickedId)),
        ];
        this.refreshDensityMode();
        renderScheduler.requestFrame();
    }

    detach(): void {
        for (const unsub of this.unsubscribes) unsub();
        this.unsubscribes = [];
        if (this.scene && !this.scene.isDestroyed()) {
            if (this.billboards) this.scene.primitives.remove(this.billboards);
            if (this.points) this.scene.primitives.remove(this.points);
            if (this.densityColl) this.scene.primitives.remove(this.densityColl);
            if (this.pulseColl) this.scene.primitives.remove(this.pulseColl);
        }
        this.billboards = null;
        this.points = null;
        this.densityColl = null;
        this.pulseColl = null;
        this.scene = null;
        this.markers.clear();
        this.fadingOut.clear();
        this.densityCells.clear();
        this.firstDeltaSeen = false;
        renderScheduler.requestFrame();
    }

    setLOD(tier: LODTier): void {
        if (tier === this.tier) return;
        this.tier = tier;
        this.refreshDensityMode();
        renderScheduler.requestFrame();
    }

    getPosition(entityId: string): Cartesian3 | null {
        const marker = this.markers.get(entityId);
        return marker ? marker.position : null;
    }

    private onDelta(delta: EntityDelta<PointEntity<T>>): void {
        const firstLoad = !this.firstDeltaSeen;
        this.firstDeltaSeen = true;
        for (const e of delta.upserts) this.upsert(e, true, !firstLoad);
        for (const id of delta.removes) this.removeWithFade(id);
        if (this.tier === LODTier.GLOBAL && this.config.clustered) this.rebuildDensityCells();
        renderScheduler.requestFrame();
    }

    private upsert(e: PointEntity<T>, fadeNew: boolean, pulseNew: boolean): void {
        const position = Cartesian3.fromDegrees(e.lon, e.lat, e.alt, undefined, scratch);
        let marker = this.markers.get(e.id);
        if (marker && this.fadingOut.has(e.id)) {
            // Gjenoppstod under fade-ut: fjern og gjenskap med full alfa
            this.removeMarker(e.id);
            marker = undefined;
        }

        if (!marker) {
            marker = this.createMarker(e, Cartesian3.clone(position));
            this.markers.set(e.id, marker);
            if (fadeNew) {
                const m = marker;
                const base = this.baseColor(e);
                fadeAlpha((a) => { m.color = base.withAlpha(a); }, FADE_IN_MS, 'in');
            }
            if (pulseNew && e.pulse) this.spawnPulse(e);
        } else {
            marker.position = Cartesian3.clone(position, marker.position);
            this.styleMarker(marker, e);
        }
    }

    private baseColor(e: PointEntity<T>): Color {
        // Billboards: atlas-ikonet bærer fargen → hvit tint (full glyf).
        // Points: fargen ER punktet.
        return this.mode === 'billboard' ? Color.WHITE : Color.fromCssColorString(e.color);
    }

    private createMarker(e: PointEntity<T>, position: Cartesian3): Billboard | PointPrimitive {
        if (this.mode === 'billboard' && this.billboards) {
            const region = iconAtlas.getRegion(e.iconId);
            const b = this.billboards.add({
                id: primitiveId(this.id, e.id),
                position,
                width: e.sizePx,
                height: e.sizePx,
                color: Color.WHITE,
                horizontalOrigin: HorizontalOrigin.CENTER,
                verticalOrigin: VerticalOrigin.CENTER,
                heightReference: HeightReference.CLAMP_TO_GROUND,
            });
            b.setImage(ATLAS_IMAGE_ID, iconAtlas.canvas);
            b.setImageSubRegion(ATLAS_IMAGE_ID, new BoundingRectangle(region.x, region.yFromBottom, region.width, region.height));
            return b;
        }
        const p = this.points!.add({
            id: primitiveId(this.id, e.id),
            position,
            pixelSize: e.sizePx,
            color: Color.fromCssColorString(e.color),
            outlineColor: Color.fromCssColorString(e.color).withAlpha(1),
            outlineWidth: 1,
        });
        return p;
    }

    private styleMarker(marker: Billboard | PointPrimitive, e: PointEntity<T>): void {
        if (this.mode === 'billboard') {
            const b = marker as Billboard;
            const region = iconAtlas.getRegion(e.iconId);
            b.setImageSubRegion(ATLAS_IMAGE_ID, new BoundingRectangle(region.x, region.yFromBottom, region.width, region.height));
            b.width = e.sizePx;
            b.height = e.sizePx;
        } else {
            const p = marker as PointPrimitive;
            p.pixelSize = e.sizePx;
            p.color = Color.fromCssColorString(e.color);
            p.outlineColor = Color.fromCssColorString(e.color).withAlpha(1);
        }
    }

    private removeMarker(id: string): void {
        const marker = this.markers.get(id);
        if (!marker) return;
        if (this.mode === 'billboard') this.billboards?.remove(marker as Billboard);
        else this.points?.remove(marker as PointPrimitive);
        this.markers.delete(id);
        this.fadingOut.delete(id);
    }

    private removeWithFade(id: string): void {
        const marker = this.markers.get(id);
        if (!marker || this.fadingOut.has(id)) return;
        this.fadingOut.add(id);
        const base = this.mode === 'billboard' ? Color.WHITE : marker.color.clone();
        fadeAlpha(
            (a) => { marker.color = base.withAlpha(a); },
            FADE_OUT_MS,
            'out',
            () => { if (this.fadingOut.has(id)) { this.removeMarker(id); renderScheduler.requestFrame(); } },
        );
    }

    // ---- Pulse-ring (delt animasjonsdriver, matcher spawnPulseRing-uttrykket) ----

    private spawnPulse(e: PointEntity<T>): void {
        if (!this.pulseColl) return;
        const color = Color.fromCssColorString(e.color);
        const ring = this.pulseColl.add({
            position: Cartesian3.fromDegrees(e.lon, e.lat, e.alt),
            pixelSize: e.sizePx,
            color: Color.TRANSPARENT,
            outlineColor: color,
            outlineWidth: 2,
        });
        renderScheduler.animate({
            durationMs: PULSE_MS,
            onTick: (t) => {
                ring.pixelSize = e.sizePx + t * PULSE_MAX_PX;
                ring.outlineColor = color.withAlpha(1 - t);
            },
            onDone: () => { this.pulseColl?.remove(ring); renderScheduler.requestFrame(); },
        });
    }

    // ---- GLOBAL-tier tetthetsmodus (erstatter Cesium-klustring) ----

    private refreshDensityMode(): void {
        if (!this.config.clustered || !this.densityColl) return;
        const global = this.tier === LODTier.GLOBAL;
        if (this.billboards) this.billboards.show = !global;
        if (this.points) this.points.show = !global;
        if (global) this.rebuildDensityCells();
        else if (this.densityColl.length > 0) {
            this.densityColl.removeAll();
            this.densityCells.clear();
        }
    }

    private rebuildDensityCells(): void {
        const coll = this.densityColl;
        if (!coll) return;
        coll.removeAll();
        this.densityCells.clear();
        const items = [...this.store.getAll().values()];
        const cssColor = this.config.clusterColor ?? items[0]?.color ?? '#ffffff';
        const color = Color.fromCssColorString(cssColor);
        for (const cell of binToDensityCells(items, DENSITY_CELL_DEG)) {
            const cellId = `${this.densityPrefix}${cell.lon.toFixed(1)}:${cell.lat.toFixed(1)}`;
            this.densityCells.set(cellId, { lon: cell.lon, lat: cell.lat });
            const magnitude = Math.log10(cell.count + 1);
            coll.add({
                id: cellId,
                position: Cartesian3.fromDegrees(cell.lon, cell.lat, 0),
                pixelSize: 8 + magnitude * 7,
                color: color.withAlpha(Math.min(0.35 + magnitude * 0.25, 0.9)),
                outlineColor: color.withAlpha(0.3),
                outlineWidth: 2,
            });
        }
    }

    private onDensityPick(pickedId: string): boolean {
        const cell = this.densityCells.get(pickedId);
        const scene = this.scene;
        if (!cell || !scene) return false;
        const targetHeight = Math.max(scene.camera.positionCartographic.height * 0.35, 100_000);
        scene.camera.flyTo({
            destination: Cartesian3.fromDegrees(cell.lon, cell.lat, targetHeight),
            duration: 0.8,
        });
        return true;
    }
}
