// Primitive-renderer for flights-kanalen: én BillboardCollection + én
// PolylineCollection (trails) + én LabelCollection (callsigns) i stedet for
// Entity-per-fly (10–100× billigere per objekt, én draw-batch per collection).
// Abonnerer direkte på EntityStore('flights') — posisjoner @ 4 Hz kommer som
// Float64Array fra channel-workerens dead-reckoning.
//
// LOD-profil (jf. docs/ARCHITECTURE-VISION.md):
//   GLOBAL → tetthetsceller (PointPrimitiveCollection; erstatter Entity-klustring)
//   REGION → kun ikoner
//   LOKAL  → ikoner + trails + label-kvote
//   NÆR    → ikoner + trails + label-kvote (3D-modeller er utsatt, se docs/FLIGHT-PARITY.md)
//
// Parkerte/taxiende fly (onGround) skjules — parity med legacy-laget.

import {
    BillboardCollection,
    BoundingRectangle,
    Cartesian2,
    Cartesian3,
    Color,
    HorizontalOrigin,
    LabelCollection,
    LabelStyle,
    Material,
    NearFarScalar,
    PointPrimitiveCollection,
    PolylineCollection,
    VerticalOrigin,
    type Billboard,
    type Label,
    type Polyline,
    type Scene,
} from 'cesium';
import { binToDensityCells } from '@/utils/densityGrid';
import { pickRouter } from '@/core/pickRouter';
import type { EntityStore, EntityDelta } from '@/core/EntityStore';
import { LODTier, lodGovernor } from '@/core/LODGovernor';
import { renderScheduler } from '@/core/RenderScheduler';
import { trackingProviders } from '@/core/trackingProviders';
import { iconAtlas } from '@/render/IconAtlas';
import { ensureSharedAtlas } from '@/render/atlasSpecs';
import { flightIconId } from '@/render/flightIcons';
import { fadeAlpha, primitiveId, type LayerRenderer } from '@/render/RendererBase';
import { headingToBillboardRotation } from '@/utils/flightKinematics';
import { TrailBuffer } from '@/utils/trailBuffer';
import type { FlightEntity } from '@/data/channels/flightProtocol';

/** Samme skala-kurve som legacy-laget: 40px ved 500 km → 10px ved 2000 km. */
const SCALE_BY_DISTANCE = new NearFarScalar(500_000, 1.0, 2_000_000, 0.25);
const ICON_PX = 40;
const ATLAS_IMAGE_ID = 'worldview-atlas';
const FADE_IN_MS = 500;
const FADE_OUT_MS = 350;
const MAX_FLIGHT_TRAIL = 40;
const TRAIL_COLOR = Color.fromCssColorString('#ffa500').withAlpha(0.6);
const TRAIL_MILITARY_COLOR = Color.fromCssColorString('#ff2244').withAlpha(0.6);
const LABEL_FONT = '12px "JetBrains Mono", monospace';
const LABEL_OFFSET = new Cartesian2(0, -26);
const LABEL_FILL = Color.fromCssColorString('#ffd9a0');
const DENSITY_CELL_DEG = 1;
const DENSITY_PICK_PREFIX = 'flights:cell:';
const DENSITY_COLOR = Color.fromCssColorString('#ffa500');

const scratchPosition = new Cartesian3();
const scratchAxis = new Cartesian3();
const scratchCamera = new Cartesian3();

export class FlightRenderer implements LayerRenderer {
    readonly id = 'flights';

    private readonly store: EntityStore<FlightEntity>;
    private scene: Scene | null = null;
    private collection: BillboardCollection | null = null;
    private trailCollection: PolylineCollection | null = null;
    private labelCollection: LabelCollection | null = null;
    private densityCollection: PointPrimitiveCollection | null = null;
    private densityCells = new Map<string, { lon: number; lat: number }>();

    private billboards = new Map<string, Billboard>();
    private trails = new Map<string, Polyline>();
    private labels = new Map<string, Label>();
    private trailHistory = new Map<string, TrailBuffer<Cartesian3>>();
    private fadingOut = new Set<string>();
    private unsubscribes: (() => void)[] = [];
    private tier: LODTier = LODTier.REGION;

    constructor(store: EntityStore<FlightEntity>) {
        this.store = store;
    }

    attach(scene: Scene): void {
        if (this.scene) return;
        ensureSharedAtlas();
        this.scene = scene;
        this.collection = new BillboardCollection({ scene });
        this.trailCollection = new PolylineCollection();
        this.labelCollection = new LabelCollection({ scene });
        this.densityCollection = new PointPrimitiveCollection();
        scene.primitives.add(this.collection);
        scene.primitives.add(this.trailCollection);
        scene.primitives.add(this.labelCollection);
        scene.primitives.add(this.densityCollection);

        // Full resync mot storens nåværende innhold, deretter deltaer
        for (const flight of this.store.getAll().values()) this.upsert(flight, false);
        this.refreshDetailAssignments();
        this.unsubscribes = [
            this.store.subscribe((delta) => this.onDelta(delta)),
            this.store.subscribePositions(() => this.onPositions()),
            // Kamera-tracking («Følg»-knappen): id er icao24 uten prefiks
            trackingProviders.register((entityId) => this.getPosition(entityId)),
            // Klikk på tetthetscelle → zoom mot cellen (samme UX som cluster-klikk)
            pickRouter.register(DENSITY_PICK_PREFIX, (pickedId) => this.onDensityCellPick(pickedId)),
        ];
        this.refreshDensityMode();
        renderScheduler.requestFrame();
    }

    detach(): void {
        for (const unsub of this.unsubscribes) unsub();
        this.unsubscribes = [];
        lodGovernor.releaseQuota('labels', this.id);
        lodGovernor.releaseQuota('polylines', this.id);
        if (this.scene && !this.scene.isDestroyed()) {
            if (this.collection) this.scene.primitives.remove(this.collection);
            if (this.trailCollection) this.scene.primitives.remove(this.trailCollection);
            if (this.labelCollection) this.scene.primitives.remove(this.labelCollection);
            if (this.densityCollection) this.scene.primitives.remove(this.densityCollection);
        }
        this.collection = null;
        this.trailCollection = null;
        this.labelCollection = null;
        this.densityCollection = null;
        this.densityCells.clear();
        this.scene = null;
        this.billboards.clear();
        this.trails.clear();
        this.labels.clear();
        this.trailHistory.clear();
        this.fadingOut.clear();
        renderScheduler.requestFrame();
    }

    setLOD(tier: LODTier): void {
        if (tier === this.tier) return;
        this.tier = tier;
        this.refreshDetailAssignments();
        this.refreshDensityMode();
        renderScheduler.requestFrame();
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

    private get detailVisible(): boolean {
        return this.tier === LODTier.LOKAL || this.tier === LODTier.NAER;
    }

    private onDelta(delta: EntityDelta<FlightEntity>): void {
        if (!this.collection) return;
        for (const flight of delta.upserts) this.upsert(flight, true);
        for (const id of delta.removes) this.removeWithFade(id);
        this.refreshDetailAssignments();
        if (this.tier === LODTier.GLOBAL) this.rebuildDensityCells();
        renderScheduler.requestFrame();
    }

    private upsert(flight: FlightEntity, fadeNew: boolean): void {
        const collection = this.collection;
        if (!collection) return;
        // Parkerte/taxiende fly skjules (parity med legacy-laget): fjern evt.
        // eksisterende billboard (fade-ut = «landing») og hopp over. Uten dette
        // forurenser bakke-fly både luftbildet og gate-crossing-deteksjonen.
        if (flight.onGround) {
            this.removeWithFade(flight.id);
            return;
        }
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

        // Trail-historikk per poll (som legacy: DR flytter ikonet, ikke sporet)
        let history = this.trailHistory.get(flight.id);
        if (!history) {
            history = new TrailBuffer<Cartesian3>(MAX_FLIGHT_TRAIL);
            this.trailHistory.set(flight.id, history);
        }
        history.push(Cartesian3.fromDegrees(flight.lon, flight.lat, flight.altitude));
        const polyline = this.trails.get(flight.id);
        if (polyline) polyline.positions = history.tail(MAX_FLIGHT_TRAIL);
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
        this.trailHistory.delete(id);
        this.dropTrail(id);
        this.dropLabel(id);
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
            const label = this.labels.get(ids[i]);
            if (label) label.position = position;
            wrote = true;
        }
        if (wrote) renderScheduler.requestFrame();
    }

    // ---- Detalj-tildeling (trails + labels) ----

    /**
     * LOKAL/NÆR: nærmest-kamera-fly får trail + label innenfor LODGovernors
     * kvoter. Kalles ved tier-skifte og per delta (poll-kadens) — aldri per
     * frame. GLOBAL/REGION: alle trails/labels fjernes.
     */
    private refreshDetailAssignments(): void {
        if (!this.trailCollection || !this.labelCollection) return;

        if (!this.detailVisible || this.billboards.size === 0) {
            if (this.trails.size > 0 || this.labels.size > 0) {
                for (const id of [...this.trails.keys()]) this.dropTrail(id);
                for (const id of [...this.labels.keys()]) this.dropLabel(id);
            }
            return;
        }

        const scene = this.scene;
        if (!scene) return;
        const cameraPos = Cartesian3.clone(scene.camera.positionWC, scratchCamera);

        const byDistance: { id: string; dist: number }[] = [];
        for (const [id, billboard] of this.billboards) {
            if (this.fadingOut.has(id)) continue;
            byDistance.push({ id, dist: Cartesian3.distanceSquared(billboard.position, cameraPos) });
        }
        byDistance.sort((a, b) => a.dist - b.dist);

        const trailQuota = lodGovernor.requestQuota('polylines', this.id, byDistance.length);
        const labelQuota = lodGovernor.requestQuota('labels', this.id, byDistance.length);

        const wantTrails = new Set(byDistance.slice(0, trailQuota).map((e) => e.id));
        const wantLabels = new Set(byDistance.slice(0, labelQuota).map((e) => e.id));

        for (const id of [...this.trails.keys()]) {
            if (!wantTrails.has(id)) this.dropTrail(id);
        }
        for (const id of [...this.labels.keys()]) {
            if (!wantLabels.has(id)) this.dropLabel(id);
        }
        for (const id of wantTrails) this.ensureTrail(id);
        for (const id of wantLabels) this.ensureLabel(id);
    }

    private ensureTrail(id: string): void {
        if (this.trails.has(id) || !this.trailCollection) return;
        const history = this.trailHistory.get(id);
        const flight = this.store.get(id);
        if (!history || !flight || history.size < 2) return;
        // Hver trail får SIN EGEN Material-instans. Cesium destruerer en
        // polylinjes material når polylinjen fjernes (Polyline._destroy →
        // material.destroy). En delt material ville derfor blitt destruert av
        // den FØRSTE trailen som droppes, og etterlatt de øvrige med en
        // destruert material → «This object was destroyed» ved neste render.
        const polyline = this.trailCollection.add({
            id: `${primitiveId(this.id, id)}:trail`,
            positions: history.tail(MAX_FLIGHT_TRAIL),
            width: 2,
            material: Material.fromType('PolylineGlow', {
                glowPower: 0.15,
                color: flight.isMilitary ? TRAIL_MILITARY_COLOR : TRAIL_COLOR,
            }),
        });
        this.trails.set(id, polyline);
    }

    private dropTrail(id: string): void {
        const polyline = this.trails.get(id);
        if (polyline) {
            this.trailCollection?.remove(polyline);
            this.trails.delete(id);
        }
    }

    private ensureLabel(id: string): void {
        if (this.labels.has(id) || !this.labelCollection) return;
        const flight = this.store.get(id);
        const billboard = this.billboards.get(id);
        if (!flight || !billboard) return;
        const label = this.labelCollection.add({
            id: `${primitiveId(this.id, id)}:label`,
            position: billboard.position,
            text: flight.callsign || flight.icao24,
            font: LABEL_FONT,
            fillColor: LABEL_FILL,
            outlineColor: Color.BLACK,
            outlineWidth: 2,
            style: LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: LABEL_OFFSET,
            horizontalOrigin: HorizontalOrigin.CENTER,
            verticalOrigin: VerticalOrigin.BOTTOM,
            scaleByDistance: SCALE_BY_DISTANCE,
        });
        this.labels.set(id, label);
    }

    private dropLabel(id: string): void {
        const label = this.labels.get(id);
        if (label) {
            this.labelCollection?.remove(label);
            this.labels.delete(id);
        }
    }

    // ---- GLOBAL-tier tetthetsmodus (erstatter Entity-klustring) ----

    /** GLOBAL: skjul individuelle fly, vis tetthetsceller. Andre tiers: omvendt. */
    private refreshDensityMode(): void {
        if (!this.collection || !this.densityCollection) return;
        const global = this.tier === LODTier.GLOBAL;
        this.collection.show = !global;
        if (global) {
            this.rebuildDensityCells();
        } else if (this.densityCollection.length > 0) {
            this.densityCollection.removeAll();
            this.densityCells.clear();
        }
    }

    private rebuildDensityCells(): void {
        const collection = this.densityCollection;
        if (!collection) return;
        collection.removeAll();
        this.densityCells.clear();

        const flights = [...this.store.getAll().values()];
        const cells = binToDensityCells(flights, DENSITY_CELL_DEG);
        for (const cell of cells) {
            const cellId = `${DENSITY_PICK_PREFIX}${cell.lon.toFixed(1)}:${cell.lat.toFixed(1)}`;
            this.densityCells.set(cellId, { lon: cell.lon, lat: cell.lat });
            // Størrelse og glød ∝ log(antall): 1 fly = 6px, 100 fly ≈ 20px
            const magnitude = Math.log10(cell.count + 1);
            collection.add({
                id: cellId,
                position: Cartesian3.fromDegrees(cell.lon, cell.lat, 0),
                pixelSize: 6 + magnitude * 7,
                color: DENSITY_COLOR.withAlpha(Math.min(0.35 + magnitude * 0.25, 0.9)),
                outlineColor: DENSITY_COLOR.withAlpha(0.25),
                outlineWidth: 2,
            });
        }
    }

    /** Klikk på celle: zoom mot cellesenteret — samme UX som cluster-klikk-zoom. */
    private onDensityCellPick(pickedId: string): boolean {
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
