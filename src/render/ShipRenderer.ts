// Primitive-renderer for ships-kanalen (Fase C). LOD-pyramide i stedet for ~15
// entiteter per skip (jf. docs/ARCHITECTURE-VISION.md):
//   GLOBAL → tetthetsceller (erstatter Cesium-klustring)
//   REGION → skrog-billboard (type-tintet, heading-rotert; rødt om mørkt)
//   LOKAL  → + trails + labels (nærmest-kamera innenfor LODGovernor-kvote)
//   NÆR    → + 3D skrog-boks (nærmest-kamera, entity-datasource)
//
// Skrog-boksene lever i én renderer-eid CustomDataSource og bygges KUN for de
// nærmeste skipene ved NÆR-tier — «to mønstre» er bevisst tillatt for
// nær-detalj. Ghosts (mørke skip som forlot AIS) rendres som falmede røde
// billboards. Se docs/SHIP-PARITY.md for bevisste avvik (overbygg/nav-lys/
// radar/røyk/kjølvann er utsatt).

import {
    BillboardCollection,
    BoundingRectangle,
    Cartesian2,
    Cartesian3,
    Color,
    ConstantPositionProperty,
    ConstantProperty,
    CustomDataSource,
    Entity,
    HeadingPitchRoll,
    HorizontalOrigin,
    LabelCollection,
    LabelStyle,
    Material,
    Math as CesiumMath,
    NearFarScalar,
    PointPrimitiveCollection,
    PolylineCollection,
    Transforms,
    VerticalOrigin,
    type Billboard,
    type Label,
    type Polyline,
    type Viewer,
} from 'cesium';
import { binToDensityCells } from '@/utils/densityGrid';
import { pickRouter } from '@/core/pickRouter';
import type { EntityStore, EntityDelta } from '@/core/EntityStore';
import { LODTier, lodGovernor } from '@/core/LODGovernor';
import { renderScheduler } from '@/core/RenderScheduler';
import { trackingProviders } from '@/core/trackingProviders';
import { iconAtlas } from '@/render/IconAtlas';
import { ensureSharedAtlas, ATLAS_IMAGE_ID } from '@/render/atlasSpecs';
import { SHIP_ICON_ID, SHIP_ICON_PX, shipTint } from '@/render/shipIcons';
import { headingToBillboardRotation } from '@/utils/flightKinematics';
import { getShipDimensions, getShipColorCss } from '@/utils/ship-utils';
import { cachedGlobeHeight } from '@/utils/globeHeightCache';
import { TrailBuffer } from '@/utils/trailBuffer';
import type { ShipEntity } from '@/data/channels/shipProtocol';
import type { Ghost } from '@/data/channels/shipChannel';

const SCALE_BY_DISTANCE = new NearFarScalar(200, 1.2, 3_000_000, 0.35);
const MAX_SHIP_TRAIL = 60;
const TRAIL_COLOR = Color.fromCssColorString('#00d4ff').withAlpha(0.9);
const LABEL_FONT = '11px Inter, sans-serif';
const LABEL_OFFSET = new Cartesian2(0, -18);
const LABEL_SCALE = new NearFarScalar(5_000, 1.0, 150_000, 0.45);
const DENSITY_CELL_DEG = 1;
const DENSITY_PREFIX = 'ships:cell:';
const DENSITY_COLOR = Color.fromCssColorString('#00d4ff');
const HULL_MAX = 80; // maks 3D-skrog samtidig (NÆR-tier)
const SEA_OFFSET = 1;

const scratchPos = new Cartesian3();
const scratchAxis = new Cartesian3();
const scratchCam = new Cartesian3();

function effectiveHeading(ship: ShipEntity): number {
    return ship.heading >= 0 && ship.heading <= 360 ? ship.heading : ship.course;
}

export class ShipRenderer {
    readonly id = 'ships';

    private readonly store: EntityStore<ShipEntity>;
    private readonly getGhosts: () => ReadonlyMap<number, Ghost>;

    private viewer: Viewer | null = null;
    private billboards: BillboardCollection | null = null;
    private ghostColl: BillboardCollection | null = null;
    private trailColl: PolylineCollection | null = null;
    private labelColl: LabelCollection | null = null;
    private densityColl: PointPrimitiveCollection | null = null;
    private hullDs: CustomDataSource | null = null;

    private markers = new Map<string, Billboard>();
    private ghostMarkers = new Map<number, Billboard>();
    private trails = new Map<string, Polyline>();
    private labels = new Map<string, Label>();
    private trailHistory = new Map<string, TrailBuffer<Cartesian3>>();
    private densityCells = new Map<string, { lon: number; lat: number }>();
    private unsubscribes: (() => void)[] = [];
    private tier: LODTier = LODTier.REGION;

    constructor(store: EntityStore<ShipEntity>, getGhosts: () => ReadonlyMap<number, Ghost>) {
        this.store = store;
        this.getGhosts = getGhosts;
    }

    attach(viewer: Viewer): void {
        if (this.viewer) return;
        ensureSharedAtlas();
        this.viewer = viewer;
        const scene = viewer.scene;
        this.billboards = new BillboardCollection({ scene });
        this.ghostColl = new BillboardCollection({ scene });
        this.trailColl = new PolylineCollection();
        this.labelColl = new LabelCollection({ scene });
        this.densityColl = new PointPrimitiveCollection();
        scene.primitives.add(this.trailColl);
        scene.primitives.add(this.billboards);
        scene.primitives.add(this.ghostColl);
        scene.primitives.add(this.labelColl);
        scene.primitives.add(this.densityColl);
        this.hullDs = new CustomDataSource('ships-hulls');
        viewer.dataSources.add(this.hullDs);

        for (const ship of this.store.getAll().values()) this.upsert(ship);
        this.refreshDetail();
        this.refreshDensityMode();
        this.unsubscribes = [
            this.store.subscribe((delta) => this.onDelta(delta)),
            trackingProviders.register((entityId) => this.getPosition(entityId)),
            pickRouter.register(DENSITY_PREFIX, (pickedId) => this.onDensityPick(pickedId)),
        ];
        renderScheduler.requestFrame();
    }

    detach(): void {
        for (const unsub of this.unsubscribes) unsub();
        this.unsubscribes = [];
        lodGovernor.releaseQuota('labels', this.id);
        lodGovernor.releaseQuota('polylines', this.id);
        const viewer = this.viewer;
        if (viewer && !viewer.isDestroyed()) {
            const scene = viewer.scene;
            if (this.trailColl) scene.primitives.remove(this.trailColl);
            if (this.billboards) scene.primitives.remove(this.billboards);
            if (this.ghostColl) scene.primitives.remove(this.ghostColl);
            if (this.labelColl) scene.primitives.remove(this.labelColl);
            if (this.densityColl) scene.primitives.remove(this.densityColl);
            if (this.hullDs) viewer.dataSources.remove(this.hullDs, true);
        }
        this.billboards = null;
        this.ghostColl = null;
        this.trailColl = null;
        this.labelColl = null;
        this.densityColl = null;
        this.hullDs = null;
        this.viewer = null;
        this.markers.clear();
        this.ghostMarkers.clear();
        this.trails.clear();
        this.labels.clear();
        this.trailHistory.clear();
        this.densityCells.clear();
        renderScheduler.requestFrame();
    }

    setLOD(tier: LODTier): void {
        if (tier === this.tier) return;
        this.tier = tier;
        this.refreshDetail();
        this.refreshDensityMode();
        renderScheduler.requestFrame();
    }

    getPosition(entityId: string): Cartesian3 | null {
        return this.markers.get(entityId)?.position ?? null;
    }

    private get detailVisible(): boolean {
        return this.tier === LODTier.LOKAL || this.tier === LODTier.NAER;
    }

    private onDelta(delta: EntityDelta<ShipEntity>): void {
        if (!this.billboards) return;
        for (const ship of delta.upserts) this.upsert(ship);
        for (const id of delta.removes) this.remove(id);
        this.refreshDetail();
        if (this.tier === LODTier.GLOBAL) this.rebuildDensityCells();
        this.refreshGhosts();
        renderScheduler.requestFrame();
    }

    private upsert(ship: ShipEntity): void {
        const collection = this.billboards;
        if (!collection) return;
        const position = Cartesian3.fromDegrees(ship.lon, ship.lat, 0, undefined, scratchPos);
        let billboard = this.markers.get(ship.id);
        if (!billboard) {
            const region = iconAtlas.getRegion(SHIP_ICON_ID);
            billboard = collection.add({
                id: `ships:${ship.id}`,
                position: Cartesian3.clone(position),
                width: SHIP_ICON_PX,
                height: SHIP_ICON_PX,
                rotation: headingToBillboardRotation(effectiveHeading(ship)),
                alignedAxis: Cartesian3.normalize(position, new Cartesian3()),
                color: shipTint(ship.shipType, ship.dark),
                scaleByDistance: SCALE_BY_DISTANCE,
                horizontalOrigin: HorizontalOrigin.CENTER,
                verticalOrigin: VerticalOrigin.CENTER,
            });
            billboard.setImage(ATLAS_IMAGE_ID, iconAtlas.canvas);
            billboard.setImageSubRegion(ATLAS_IMAGE_ID, new BoundingRectangle(region.x, region.yFromBottom, region.width, region.height));
            this.markers.set(ship.id, billboard);
        } else {
            billboard.position = Cartesian3.clone(position, billboard.position);
            billboard.rotation = headingToBillboardRotation(effectiveHeading(ship));
            billboard.alignedAxis = Cartesian3.normalize(position, scratchAxis);
            billboard.color = shipTint(ship.shipType, ship.dark);
        }

        // Trail-historikk per batch
        let history = this.trailHistory.get(ship.id);
        if (!history) {
            history = new TrailBuffer<Cartesian3>(MAX_SHIP_TRAIL);
            this.trailHistory.set(ship.id, history);
        }
        history.push(Cartesian3.fromDegrees(ship.lon, ship.lat, 0));
        const polyline = this.trails.get(ship.id);
        if (polyline) polyline.positions = history.tail(MAX_SHIP_TRAIL);
        const label = this.labels.get(ship.id);
        if (label) label.position = Cartesian3.clone(billboard.position);
    }

    private remove(id: string): void {
        const billboard = this.markers.get(id);
        if (billboard) { this.billboards?.remove(billboard); this.markers.delete(id); }
        this.dropTrail(id);
        this.dropLabel(id);
        this.trailHistory.delete(id);
        this.hullDs?.entities.removeById(`hull-${id}`);
    }

    // ---- Detalj (trails + labels + 3D-skrog) ----

    private refreshDetail(): void {
        if (!this.trailColl || !this.labelColl) return;
        if (!this.detailVisible || this.markers.size === 0) {
            for (const id of [...this.trails.keys()]) this.dropTrail(id);
            for (const id of [...this.labels.keys()]) this.dropLabel(id);
            this.clearHulls();
            return;
        }
        const viewer = this.viewer;
        if (!viewer) return;
        const cameraPos = Cartesian3.clone(viewer.scene.camera.positionWC, scratchCam);
        const byDistance: { id: string; dist: number }[] = [];
        for (const [id, b] of this.markers) {
            byDistance.push({ id, dist: Cartesian3.distanceSquared(b.position, cameraPos) });
        }
        byDistance.sort((a, b) => a.dist - b.dist);

        const trailQuota = lodGovernor.requestQuota('polylines', this.id, byDistance.length);
        const labelQuota = lodGovernor.requestQuota('labels', this.id, byDistance.length);
        const wantTrails = new Set(byDistance.slice(0, trailQuota).map((e) => e.id));
        const wantLabels = new Set(byDistance.slice(0, labelQuota).map((e) => e.id));
        for (const id of [...this.trails.keys()]) if (!wantTrails.has(id)) this.dropTrail(id);
        for (const id of [...this.labels.keys()]) if (!wantLabels.has(id)) this.dropLabel(id);
        for (const id of wantTrails) this.ensureTrail(id);
        for (const id of wantLabels) this.ensureLabel(id);

        // 3D-skrog kun ved NÆR, for de nærmeste skipene
        if (this.tier === LODTier.NAER) {
            const wantHulls = new Set(byDistance.slice(0, HULL_MAX).map((e) => e.id));
            for (const e of [...(this.hullDs?.entities.values ?? [])]) {
                const id = e.id.slice('hull-'.length);
                if (!wantHulls.has(id)) this.hullDs?.entities.removeById(e.id);
            }
            for (const id of wantHulls) this.ensureHull(id);
        } else {
            this.clearHulls();
        }
    }

    private ensureTrail(id: string): void {
        if (this.trails.has(id) || !this.trailColl) return;
        const history = this.trailHistory.get(id);
        if (!history || history.size < 2) return;
        // Egen Material-instans per trail: Cesium destruerer materialet når
        // polylinjen fjernes, så en delt material ville blitt revet vekk under
        // de øvrige trailene ved første drop → «This object was destroyed».
        const polyline = this.trailColl.add({
            id: `ships:${id}:trail`,
            positions: history.tail(MAX_SHIP_TRAIL),
            width: 2,
            material: Material.fromType('PolylineGlow', { glowPower: 0.4, color: TRAIL_COLOR }),
        });
        this.trails.set(id, polyline);
    }

    private dropTrail(id: string): void {
        const polyline = this.trails.get(id);
        if (polyline) { this.trailColl?.remove(polyline); this.trails.delete(id); }
    }

    private ensureLabel(id: string): void {
        if (this.labels.has(id) || !this.labelColl) return;
        const ship = this.store.get(id);
        const billboard = this.markers.get(id);
        if (!ship || !billboard) return;
        const label = this.labelColl.add({
            id: `ships:${id}:label`,
            position: Cartesian3.clone(billboard.position),
            text: ship.name || `MMSI ${ship.mmsi}`,
            font: LABEL_FONT,
            fillColor: Color.WHITE,
            outlineColor: Color.BLACK.withAlpha(0.8),
            outlineWidth: 2,
            style: LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: LABEL_OFFSET,
            horizontalOrigin: HorizontalOrigin.CENTER,
            verticalOrigin: VerticalOrigin.BOTTOM,
            scaleByDistance: LABEL_SCALE,
        });
        this.labels.set(id, label);
    }

    private dropLabel(id: string): void {
        const label = this.labels.get(id);
        if (label) { this.labelColl?.remove(label); this.labels.delete(id); }
    }

    private ensureHull(id: string): void {
        const ds = this.hullDs;
        const viewer = this.viewer;
        const ship = this.store.get(id);
        if (!ds || !viewer || !ship) return;
        const dims = getShipDimensions(ship.shipType, ship.length, ship.width);
        const terrainH = cachedGlobeHeight(viewer.scene, ship.lon, ship.lat, 50);
        const baseAlt = Math.max(0, terrainH) + SEA_OFFSET;
        const seaPos = Cartesian3.fromDegrees(ship.lon, ship.lat, baseAlt);
        const hullPos = Cartesian3.fromDegrees(ship.lon, ship.lat, baseAlt + dims.height / 2);
        const heading = effectiveHeading(ship);
        const orientation = Transforms.headingPitchRollQuaternion(
            seaPos, new HeadingPitchRoll(CesiumMath.toRadians(heading), 0, 0),
        );
        const color = Color.fromCssColorString(getShipColorCss(ship.shipType)).withAlpha(1);
        const existing = ds.entities.getById(`hull-${id}`);
        if (existing && existing.box) {
            (existing.position as ConstantPositionProperty).setValue(hullPos);
            (existing.orientation as ConstantProperty).setValue(orientation);
            (existing.box.dimensions as ConstantProperty).setValue(new Cartesian3(dims.width, dims.length, dims.height));
            return;
        }
        ds.entities.add(new Entity({
            id: `hull-${id}`,
            position: hullPos,
            orientation,
            box: {
                dimensions: new Cartesian3(dims.width, dims.length, dims.height),
                material: color,
                outline: true,
                outlineColor: Color.BLACK.withAlpha(0.3),
            },
        }));
    }

    private clearHulls(): void {
        if (this.hullDs && this.hullDs.entities.values.length > 0) this.hullDs.entities.removeAll();
    }

    // ---- Ghosts (mørke skip som forlot AIS) ----

    private refreshGhosts(): void {
        const coll = this.ghostColl;
        if (!coll) return;
        const ghosts = this.getGhosts();
        const seen = new Set<number>();
        for (const [mmsi, ghost] of ghosts) {
            seen.add(mmsi);
            const pos = Cartesian3.fromDegrees(ghost.ship.lon, ghost.ship.lat, 80);
            let b = this.ghostMarkers.get(mmsi);
            if (!b) {
                const region = iconAtlas.getRegion(SHIP_ICON_ID);
                b = coll.add({
                    id: `ships:ghost-${mmsi}`,
                    position: pos,
                    width: 24,
                    height: 24,
                    rotation: headingToBillboardRotation(effectiveHeading(ghost.ship as ShipEntity)),
                    alignedAxis: Cartesian3.normalize(pos, new Cartesian3()),
                    color: Color.fromCssColorString('#ff2200').withAlpha(0.4),
                    horizontalOrigin: HorizontalOrigin.CENTER,
                    verticalOrigin: VerticalOrigin.CENTER,
                });
                b.setImage(ATLAS_IMAGE_ID, iconAtlas.canvas);
                b.setImageSubRegion(ATLAS_IMAGE_ID, new BoundingRectangle(region.x, region.yFromBottom, region.width, region.height));
                this.ghostMarkers.set(mmsi, b);
            } else {
                b.position = pos;
            }
        }
        for (const [mmsi, b] of [...this.ghostMarkers]) {
            if (!seen.has(mmsi)) { coll.remove(b); this.ghostMarkers.delete(mmsi); }
        }
    }

    // ---- GLOBAL-tetthetsmodus ----

    private refreshDensityMode(): void {
        if (!this.billboards || !this.densityColl) return;
        const global = this.tier === LODTier.GLOBAL;
        this.billboards.show = !global;
        if (global) this.rebuildDensityCells();
        else if (this.densityColl.length > 0) { this.densityColl.removeAll(); this.densityCells.clear(); }
    }

    private rebuildDensityCells(): void {
        const coll = this.densityColl;
        if (!coll) return;
        coll.removeAll();
        this.densityCells.clear();
        const ships = [...this.store.getAll().values()];
        for (const cell of binToDensityCells(ships, DENSITY_CELL_DEG)) {
            const cellId = `${DENSITY_PREFIX}${cell.lon.toFixed(1)}:${cell.lat.toFixed(1)}`;
            this.densityCells.set(cellId, { lon: cell.lon, lat: cell.lat });
            const magnitude = Math.log10(cell.count + 1);
            coll.add({
                id: cellId,
                position: Cartesian3.fromDegrees(cell.lon, cell.lat, 0),
                pixelSize: 6 + magnitude * 7,
                color: DENSITY_COLOR.withAlpha(Math.min(0.35 + magnitude * 0.25, 0.9)),
                outlineColor: DENSITY_COLOR.withAlpha(0.25),
                outlineWidth: 2,
            });
        }
    }

    private onDensityPick(pickedId: string): boolean {
        const cell = this.densityCells.get(pickedId);
        const viewer = this.viewer;
        if (!cell || !viewer) return false;
        const targetHeight = Math.max(viewer.scene.camera.positionCartographic.height * 0.35, 100_000);
        viewer.scene.camera.flyTo({ destination: Cartesian3.fromDegrees(cell.lon, cell.lat, targetHeight), duration: 0.8 });
        return true;
    }
}
