import {
    Cartesian3,
    Color,
    ColorMaterialProperty,
    ConstantPositionProperty,
    ConstantProperty,
    CustomDataSource,
    DistanceDisplayCondition,
    Entity,
    HorizontalOrigin,
    LabelStyle,
    PolygonGraphics,
    PolygonHierarchy,
    PolylineGlowMaterialProperty,
    PolylineGraphics,
    VerticalOrigin,
    Cartesian2,
} from 'cesium';
import type { HeritageMonument } from '@/types/heritage';

const LIGHT_PILLAR_HEIGHT_M = 250_000;

interface Corners {
    NE: Cartesian3;
    NW: Cartesian3;
    SW: Cartesian3;
    SE: Cartesian3;
    APEX: Cartesian3;
}

function pyramidCorners(m: HeritageMonument): Corners {
    const lat = m.center.lat;
    const lon = m.center.lon;
    const half = m.baseSizeM / 2;
    const dLat = half / 111_320;
    const dLon = half / (111_320 * Math.cos((lat * Math.PI) / 180));
    const g = m.groundElevationM;
    const a = g + m.heightM;
    return {
        NE: Cartesian3.fromDegrees(lon + dLon, lat + dLat, g),
        NW: Cartesian3.fromDegrees(lon - dLon, lat + dLat, g),
        SW: Cartesian3.fromDegrees(lon - dLon, lat - dLat, g),
        SE: Cartesian3.fromDegrees(lon + dLon, lat - dLat, g),
        APEX: Cartesian3.fromDegrees(lon, lat, a),
    };
}

function triangleFace(positions: Cartesian3[], color: Color): PolygonGraphics {
    return new PolygonGraphics({
        hierarchy: new ConstantProperty(new PolygonHierarchy(positions)),
        perPositionHeight: new ConstantProperty(true),
        material: new ColorMaterialProperty(color),
        outline: new ConstantProperty(true),
        outlineColor: new ConstantProperty(color.brighten(0.3, new Color())),
        outlineWidth: new ConstantProperty(1),
        // 0–500 km — pyramide-mesh forsvinner fra orbit, lyssøyla overtar.
        distanceDisplayCondition: new ConstantProperty(
            new DistanceDisplayCondition(0, 500_000)
        ),
    });
}

/**
 * Bygger ett pyramide-monument: 4 triangulære sideflater med glow-farge,
 * bunn-polygon, lyssøyle, navn-label, fakta-billboards og målestokk.
 *
 * Returnerer en oversikt over alle entitetenes ID-er (brukt for opprydding).
 */
export function buildPyramidEntities(ds: CustomDataSource, m: HeritageMonument): string[] {
    const ids: string[] = [];
    const color = Color.fromCssColorString(m.glowColor).withAlpha(0.55);
    const c = pyramidCorners(m);

    // 4 sideflater
    const faces: [string, Cartesian3[]][] = [
        ['n', [c.NE, c.APEX, c.NW]],
        ['w', [c.NW, c.APEX, c.SW]],
        ['s', [c.SW, c.APEX, c.SE]],
        ['e', [c.SE, c.APEX, c.NE]],
    ];
    for (const [side, pos] of faces) {
        const id = `heritage:${m.id}:face-${side}`;
        ds.entities.add(new Entity({ id, polygon: triangleFace(pos, color) }));
        ids.push(id);
    }

    // Bunn-polygon (gjør pyramiden tett mot bakken)
    const baseId = `heritage:${m.id}:base`;
    ds.entities.add(
        new Entity({
            id: baseId,
            polygon: new PolygonGraphics({
                hierarchy: new ConstantProperty(
                    new PolygonHierarchy([c.NE, c.NW, c.SW, c.SE])
                ),
                perPositionHeight: new ConstantProperty(true),
                material: new ColorMaterialProperty(color.withAlpha(0.7)),
                distanceDisplayCondition: new ConstantProperty(
                    new DistanceDisplayCondition(0, 500_000)
                ),
            }),
        })
    );
    ids.push(baseId);

    addCommonEntities(ds, m, ids, c.APEX);
    return ids;
}

/**
 * Sfinxen er ikke en pyramide — render som lavt rektangel + ikonisk billboard.
 */
export function buildSphinxEntities(ds: CustomDataSource, m: HeritageMonument): string[] {
    const ids: string[] = [];
    const color = Color.fromCssColorString(m.glowColor).withAlpha(0.55);
    const lat = m.center.lat;
    const lon = m.center.lon;
    // Sfinxen er ~73m lang × 19m bred. Vi modellerer som et avlangt rektangel
    // orientert øst-vest (Sfinxen ser mot øst).
    const halfL = 73 / 2;
    const halfW = 19 / 2;
    const dLatW = halfW / 111_320;
    const dLonL = halfL / (111_320 * Math.cos((lat * Math.PI) / 180));
    const g = m.groundElevationM;
    const a = g + m.heightM;
    const groundCorners = [
        Cartesian3.fromDegrees(lon + dLonL, lat + dLatW),
        Cartesian3.fromDegrees(lon - dLonL, lat + dLatW),
        Cartesian3.fromDegrees(lon - dLonL, lat - dLatW),
        Cartesian3.fromDegrees(lon + dLonL, lat - dLatW),
    ];
    const baseId = `heritage:${m.id}:body`;
    ds.entities.add(
        new Entity({
            id: baseId,
            polygon: new PolygonGraphics({
                hierarchy: new ConstantProperty(new PolygonHierarchy(groundCorners)),
                height: new ConstantProperty(g),
                extrudedHeight: new ConstantProperty(a),
                material: new ColorMaterialProperty(color.withAlpha(0.7)),
                outline: new ConstantProperty(true),
                outlineColor: new ConstantProperty(color.brighten(0.3, new Color())),
                distanceDisplayCondition: new ConstantProperty(
                    new DistanceDisplayCondition(0, 500_000)
                ),
            }),
        })
    );
    ids.push(baseId);

    const apex = Cartesian3.fromDegrees(lon, lat, a);
    addCommonEntities(ds, m, ids, apex);
    return ids;
}

/**
 * Lyssøyle, navn-label, fakta-billboards og målestokk — felles for alle monumenter.
 */
function addCommonEntities(
    ds: CustomDataSource,
    m: HeritageMonument,
    ids: string[],
    apex: Cartesian3,
    factAnchor?: Cartesian3
): void {
    const colorFull = Color.fromCssColorString(m.glowColor);
    const lat = m.center.lat;
    const lon = m.center.lon;
    const groundM = m.groundElevationM;
    const apexM = groundM + m.heightM;

    // Lyssøyle — fra apex og rett opp
    const pillarId = `heritage:${m.id}:pillar`;
    ds.entities.add(
        new Entity({
            id: pillarId,
            polyline: new PolylineGraphics({
                positions: new ConstantProperty([
                    apex,
                    Cartesian3.fromDegrees(lon, lat, apexM + LIGHT_PILLAR_HEIGHT_M),
                ]),
                width: new ConstantProperty(8),
                material: new PolylineGlowMaterialProperty({
                    color: colorFull,
                    glowPower: 0.35,
                    taperPower: 0.2,
                }),
            }),
        })
    );
    ids.push(pillarId);

    // Navn-label på toppen — synlig fra langt unna
    const nameId = `heritage:${m.id}:name`;
    ds.entities.add(
        new Entity({
            id: nameId,
            position: new ConstantPositionProperty(
                Cartesian3.fromDegrees(lon, lat, apexM + 200)
            ),
            label: {
                text: m.name,
                font: '600 14px Inter, sans-serif',
                fillColor: colorFull,
                outlineColor: Color.BLACK,
                outlineWidth: 3,
                style: LabelStyle.FILL_AND_OUTLINE,
                horizontalOrigin: HorizontalOrigin.CENTER,
                verticalOrigin: VerticalOrigin.BOTTOM,
                pixelOffset: new Cartesian2(0, -8),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                distanceDisplayCondition: new DistanceDisplayCondition(0, 1_500_000),
            },
        })
    );
    ids.push(nameId);

    // Fakta-billboards — float rundt monumentet ved apex-høyde, synlig på nært hold
    const anchor = factAnchor ?? apex;
    const facts = m.facts.slice(0, 4);
    facts.forEach((fact, i) => {
        const angleDeg = 45 + i * 90; // NØ, SØ, SV, NV
        const radiusM = m.baseSizeM * 0.9 + 60;
        const dLat = (radiusM / 111_320) * Math.cos((angleDeg * Math.PI) / 180);
        const dLon = (radiusM / (111_320 * Math.cos((lat * Math.PI) / 180))) * Math.sin((angleDeg * Math.PI) / 180);
        const heightM = apexM + 30 - i * 18;
        const factId = `heritage:${m.id}:fact-${i}`;
        ds.entities.add(
            new Entity({
                id: factId,
                position: new ConstantPositionProperty(
                    Cartesian3.fromDegrees(lon + dLon, lat + dLat, heightM)
                ),
                label: {
                    text: `${fact.label.toUpperCase()}\n${fact.value}${fact.unit ? ' ' + fact.unit : ''}`,
                    font: '500 11px JetBrains Mono, monospace',
                    fillColor: Color.WHITE,
                    outlineColor: colorFull.withAlpha(0.8),
                    outlineWidth: 2,
                    style: LabelStyle.FILL_AND_OUTLINE,
                    backgroundColor: Color.BLACK.withAlpha(0.55),
                    showBackground: true,
                    backgroundPadding: new Cartesian2(8, 6),
                    horizontalOrigin: HorizontalOrigin.CENTER,
                    verticalOrigin: VerticalOrigin.CENTER,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    distanceDisplayCondition: new DistanceDisplayCondition(0, 6_000),
                },
            })
        );
        ids.push(factId);
        // Tynn linje fra anchor til billboard
        const lineId = `heritage:${m.id}:fact-line-${i}`;
        ds.entities.add(
            new Entity({
                id: lineId,
                polyline: new PolylineGraphics({
                    positions: new ConstantProperty([
                        anchor,
                        Cartesian3.fromDegrees(lon + dLon, lat + dLat, heightM),
                    ]),
                    width: new ConstantProperty(1),
                    material: new ColorMaterialProperty(colorFull.withAlpha(0.4)),
                    distanceDisplayCondition: new ConstantProperty(
                        new DistanceDisplayCondition(0, 6_000)
                    ),
                }),
            })
        );
        ids.push(lineId);
    });

    // Wow-fakta — én ekstra label oppe på toppen
    if (m.wowFact) {
        const wowId = `heritage:${m.id}:wow`;
        ds.entities.add(
            new Entity({
                id: wowId,
                position: new ConstantPositionProperty(
                    Cartesian3.fromDegrees(lon, lat, apexM + 80)
                ),
                label: {
                    text: '✦ ' + m.wowFact,
                    font: 'italic 500 12px Inter, sans-serif',
                    fillColor: colorFull.brighten(0.4, new Color()),
                    outlineColor: Color.BLACK,
                    outlineWidth: 2,
                    style: LabelStyle.FILL_AND_OUTLINE,
                    horizontalOrigin: HorizontalOrigin.CENTER,
                    verticalOrigin: VerticalOrigin.BOTTOM,
                    pixelOffset: new Cartesian2(0, -32),
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    distanceDisplayCondition: new DistanceDisplayCondition(0, 8_000),
                },
            })
        );
        ids.push(wowId);
    }

    // Målestokk — vertikal pinne fra bakken til toppen + høyde-label
    const scaleId = `heritage:${m.id}:scale`;
    ds.entities.add(
        new Entity({
            id: scaleId,
            polyline: new PolylineGraphics({
                positions: new ConstantProperty([
                    Cartesian3.fromDegrees(lon, lat, groundM),
                    Cartesian3.fromDegrees(lon, lat, apexM),
                ]),
                width: new ConstantProperty(2),
                material: new ColorMaterialProperty(Color.WHITE.withAlpha(0.6)),
                distanceDisplayCondition: new ConstantProperty(
                    new DistanceDisplayCondition(0, 4_000)
                ),
            }),
        })
    );
    ids.push(scaleId);

    const scaleLabelId = `heritage:${m.id}:scale-label`;
    ds.entities.add(
        new Entity({
            id: scaleLabelId,
            position: new ConstantPositionProperty(
                Cartesian3.fromDegrees(lon, lat, groundM + m.heightM / 2)
            ),
            label: {
                text: `↕ ${m.heightM.toFixed(1)} m`,
                font: '600 11px JetBrains Mono, monospace',
                fillColor: Color.WHITE,
                outlineColor: Color.BLACK,
                outlineWidth: 2,
                style: LabelStyle.FILL_AND_OUTLINE,
                horizontalOrigin: HorizontalOrigin.LEFT,
                verticalOrigin: VerticalOrigin.CENTER,
                pixelOffset: new Cartesian2(8, 0),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                distanceDisplayCondition: new DistanceDisplayCondition(0, 4_000),
            },
        })
    );
    ids.push(scaleLabelId);

    // Nord-akse — kort linje fra base mot nord
    const northId = `heritage:${m.id}:north`;
    const northDLat = ((m.baseSizeM * 0.7) / 111_320);
    ds.entities.add(
        new Entity({
            id: northId,
            polyline: new PolylineGraphics({
                positions: new ConstantProperty([
                    Cartesian3.fromDegrees(lon, lat, groundM + 1),
                    Cartesian3.fromDegrees(lon, lat + northDLat, groundM + 1),
                ]),
                width: new ConstantProperty(2),
                material: new ColorMaterialProperty(Color.RED.withAlpha(0.7)),
                distanceDisplayCondition: new ConstantProperty(
                    new DistanceDisplayCondition(0, 3_000)
                ),
            }),
        })
    );
    ids.push(northId);

    const northLabelId = `heritage:${m.id}:north-label`;
    ds.entities.add(
        new Entity({
            id: northLabelId,
            position: new ConstantPositionProperty(
                Cartesian3.fromDegrees(lon, lat + northDLat, groundM + 5)
            ),
            label: {
                text: 'N',
                font: '700 12px JetBrains Mono, monospace',
                fillColor: Color.RED,
                outlineColor: Color.BLACK,
                outlineWidth: 2,
                style: LabelStyle.FILL_AND_OUTLINE,
                horizontalOrigin: HorizontalOrigin.CENTER,
                verticalOrigin: VerticalOrigin.BOTTOM,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                distanceDisplayCondition: new DistanceDisplayCondition(0, 3_000),
            },
        })
    );
    ids.push(northLabelId);
}
