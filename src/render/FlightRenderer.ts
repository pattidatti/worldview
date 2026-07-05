// Primitive-renderer for flights-kanalen: én BillboardCollection i stedet for
// Entity-per-fly (10–100× billigere per objekt, én draw-batch). Abonnerer
// direkte på EntityStore('flights') — posisjoner @ 4 Hz kommer som
// Float64Array fra channel-workerens dead-reckoning.

import {
    BillboardCollection,
    BoundingRectangle,
    Cartesian3,
    Color,
    HorizontalOrigin,
    NearFarScalar,
    VerticalOrigin,
    type Billboard,
    type Scene,
} from 'cesium';
import type { EntityStore, EntityDelta } from '@/core/EntityStore';
import { LODTier } from '@/core/LODGovernor';
import { renderScheduler } from '@/core/RenderScheduler';
import { iconAtlas } from '@/render/IconAtlas';
import { flightAtlasSpecs, flightIconId } from '@/render/flightIcons';
import { fadeAlpha, primitiveId, type LayerRenderer } from '@/render/RendererBase';
import { headingToBillboardRotation } from '@/utils/flightKinematics';
import type { FlightEntity } from '@/data/channels/flightProtocol';

/** Samme skala-kurve som legacy-laget: 40px ved 500 km → 10px ved 2000 km. */
const SCALE_BY_DISTANCE = new NearFarScalar(500_000, 1.0, 2_000_000, 0.25);
const ICON_PX = 40;
const ATLAS_IMAGE_ID = 'worldview-atlas';
const FADE_IN_MS = 500;
const FADE_OUT_MS = 350;

const scratchPosition = new Cartesian3();
const scratchAxis = new Cartesian3();

export class FlightRenderer implements LayerRenderer {
    readonly id = 'flights';

    private readonly store: EntityStore<FlightEntity>;
    private scene: Scene | null = null;
    private collection: BillboardCollection | null = null;
    private billboards = new Map<string, Billboard>();
    private fadingOut = new Set<string>();
    private unsubscribes: (() => void)[] = [];
    /** LOD-profil kobles på i fase B4 (trails/labels/punktmodus per tier). */
    protected tier: LODTier = LODTier.REGION;

    constructor(store: EntityStore<FlightEntity>) {
        this.store = store;
    }

    attach(scene: Scene): void {
        if (this.scene) return;
        if (!iconAtlas.isBuilt) iconAtlas.build(flightAtlasSpecs());
        this.scene = scene;
        this.collection = new BillboardCollection({ scene });
        scene.primitives.add(this.collection);

        // Full resync mot storens nåværende innhold, deretter deltaer
        for (const flight of this.store.getAll().values()) this.upsert(flight, false);
        this.unsubscribes = [
            this.store.subscribe((delta) => this.onDelta(delta)),
            this.store.subscribePositions(() => this.onPositions()),
        ];
        renderScheduler.requestFrame();
    }

    detach(): void {
        for (const unsub of this.unsubscribes) unsub();
        this.unsubscribes = [];
        if (this.scene && this.collection && !this.scene.isDestroyed()) {
            this.scene.primitives.remove(this.collection); // destroyer collection + billboards
        }
        this.collection = null;
        this.scene = null;
        this.billboards.clear();
        this.fadingOut.clear();
        renderScheduler.requestFrame();
    }

    setLOD(tier: LODTier): void {
        this.tier = tier;
    }

    /** Posisjonsoppslag for kamera-tracking (GlobeViewer trackingProviders). */
    getPosition(entityId: string): Cartesian3 | null {
        const billboard = this.billboards.get(entityId);
        if (!billboard) return null;
        return billboard.position;
    }

    get size(): number {
        return this.billboards.size;
    }

    private onDelta(delta: EntityDelta<FlightEntity>): void {
        if (!this.collection) return;
        for (const flight of delta.upserts) this.upsert(flight, true);
        for (const id of delta.removes) this.removeWithFade(id);
        renderScheduler.requestFrame();
    }

    private upsert(flight: FlightEntity, fadeNew: boolean): void {
        const collection = this.collection;
        if (!collection) return;
        let billboard = this.billboards.get(flight.id);
        if (billboard && this.fadingOut.has(flight.id)) {
            // Gjenoppstått under fade-ut: fjern og lag på nytt med full alpha
            collection.remove(billboard);
            this.billboards.delete(flight.id);
            this.fadingOut.delete(flight.id);
            billboard = undefined;
        }

        const position = Cartesian3.fromDegrees(flight.lon, flight.lat, flight.altitude, undefined, scratchPosition);
        if (!billboard) {
            billboard = collection.add({
                id: primitiveId(this.id, flight.id),
                position,
                horizontalOrigin: HorizontalOrigin.CENTER,
                verticalOrigin: VerticalOrigin.CENTER,
                scaleByDistance: SCALE_BY_DISTANCE,
                width: ICON_PX,
                height: ICON_PX,
                rotation: headingToBillboardRotation(flight.heading),
                alignedAxis: Cartesian3.normalize(position, scratchAxis),
            });
            billboard.setImage(ATLAS_IMAGE_ID, iconAtlas.canvas);
            this.setIcon(billboard, flight);
            this.billboards.set(flight.id, billboard);
            if (fadeNew) {
                const b = billboard;
                fadeAlpha((alpha) => { b.color = Color.WHITE.withAlpha(alpha); }, FADE_IN_MS, 'in');
            }
        } else {
            billboard.position = position;
            billboard.rotation = headingToBillboardRotation(flight.heading);
            billboard.alignedAxis = Cartesian3.normalize(position, scratchAxis);
            this.setIcon(billboard, flight);
        }
    }

    private setIcon(billboard: Billboard, flight: FlightEntity): void {
        const region = iconAtlas.getRegion(flightIconId(flight));
        billboard.setImageSubRegion(
            ATLAS_IMAGE_ID,
            new BoundingRectangle(region.x, region.yFromBottom, region.width, region.height),
        );
    }

    private removeWithFade(id: string): void {
        const billboard = this.billboards.get(id);
        if (!billboard || this.fadingOut.has(id)) return;
        this.fadingOut.add(id);
        fadeAlpha(
            (alpha) => { billboard.color = Color.WHITE.withAlpha(alpha); },
            FADE_OUT_MS,
            'out',
            () => {
                if (this.fadingOut.delete(id)) {
                    this.collection?.remove(billboard);
                    this.billboards.delete(id);
                    renderScheduler.requestFrame();
                }
            },
        );
    }

    /** Skriv gjeldende posisjonsbuffer (4 Hz DR-tick fra workeren) inn i billboards. */
    private onPositions(): void {
        const pb = this.store.getPositionBuffer();
        if (!pb || !this.collection) return;
        const { buffer, ids, layout } = pb;
        let wrote = false;
        for (let i = 0; i < ids.length; i++) {
            const billboard = this.billboards.get(ids[i]);
            if (!billboard) continue;
            const base = i * layout.stride;
            const position = Cartesian3.fromDegrees(
                buffer[base], buffer[base + 1], buffer[base + 2], undefined, scratchPosition,
            );
            billboard.position = position;
            billboard.rotation = headingToBillboardRotation(buffer[base + 3]);
            wrote = true;
        }
        if (wrote) renderScheduler.requestFrame();
    }
}
