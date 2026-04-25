import { useEffect, useRef } from 'react';
import {
    CustomDataSource,
    Entity,
    Cartesian3,
    Color,
    PolygonHierarchy,
    ConstantProperty,
    LabelStyle,
    VerticalOrigin,
    HorizontalOrigin,
    Cartesian2,
    NearFarScalar,
    PolylineGlowMaterialProperty,
    PolylineDashMaterialProperty,
    GridMaterialProperty,
    StripeMaterialProperty,
    StripeOrientation,
    CallbackProperty,
    JulianDate,
    HeightReference,
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayerActions, useLayerVisibility } from '@/store/layerStore';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { CHOKEPOINTS } from '@/services/chokepoints';
import { spawnPulseRing } from '@/utils/pulseRing';

const CHOKEPOINT_COLOR =
    getComputedStyle(document.documentElement).getPropertyValue('--color-chokepoints').trim() || '#ff6b35';
const BASE_COLOR = Color.fromCssColorString(CHOKEPOINT_COLOR);
const GLOW_COLOR = BASE_COLOR.withAlpha(0.95);
const LABEL_SCALE = new NearFarScalar(500_000, 1.3, 8_000_000, 0.55);

const WALL_HEIGHT_METERS = 30_000;
const PILLAR_HEIGHT_METERS = 220_000;
const SWEEP_ROTATION_PERIOD_S = 4.0;
const PULSE_PERIOD_S = 2.8;

function centroid(coords: [number, number][]): { lon: number; lat: number } {
    const lon = coords.reduce((s, c) => s + c[0], 0) / coords.length;
    const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
    return { lon, lat };
}

function pulseIntervalMs(dailyShips: number): number {
    if (dailyShips >= 100) return 1800;
    if (dailyShips >= 60) return 2800;
    if (dailyShips >= 30) return 4000;
    return 5500;
}

function pulseRadiusMeters(width_km: number): number {
    return Math.max(4_000, width_km * 1000 * 0.7);
}

function sweepRadiusMeters(width_km: number): number {
    return Math.max(25_000, Math.min(180_000, width_km * 1000 * 1.1));
}

function compassRadiusMeters(width_km: number): number {
    return Math.max(6_000, Math.min(120_000, width_km * 1000 * 0.55));
}

export function ChokepointLayer() {
    const viewer = useViewer();
    const { setLayerCount } = useLayerActions();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const visible = useLayerVisibility('chokepoints');
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const pulseDsRef = useRef<CustomDataSource | null>(null);
    const pulseTimersRef = useRef<number[]>([]);

    useEffect(() => {
        register('chokepoints', (entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const cp = CHOKEPOINTS.find((c) => entity.id === c.id || entity.id.startsWith(`${c.id}-`));
            if (!cp) return null;
            const fields: { label: string; value: string | number; unit?: string }[] = [
                { label: 'Daglig trafikk', value: cp.dailyShips, unit: ' skip/dag' },
                { label: 'Bredde', value: cp.width_km < 1 ? `${cp.width_km * 1000}` : cp.width_km, unit: cp.width_km < 1 ? ' m' : ' km' },
            ];
            if (cp.oilPercent) fields.push({ label: 'Global oljefart', value: cp.oilPercent, unit: '%' });
            return {
                title: cp.name,
                icon: '🌊',
                color: CHOKEPOINT_COLOR,
                fields,
                description: cp.description,
            };
        });
        return () => unregister('chokepoints');
    }, [register, unregister]);

    useEffect(() => {
        tooltipRegister('chokepoints', (entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const cp = CHOKEPOINTS.find((c) => entity.id === c.id || entity.id.startsWith(`${c.id}-`));
            if (!cp) return null;
            return {
                title: cp.name,
                subtitle: `${cp.dailyShips} skip/dag · ${cp.width_km} km bred`,
                icon: '🌊',
                color: CHOKEPOINT_COLOR,
            };
        });
        return () => tooltipUnregister('chokepoints');
    }, [tooltipRegister, tooltipUnregister]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('chokepoints');
        const pulseDs = new CustomDataSource('chokepoints-pulse');
        viewer.dataSources.add(ds);
        viewer.dataSources.add(pulseDs);
        dataSourceRef.current = ds;
        pulseDsRef.current = pulseDs;

        const epochJd = JulianDate.now();

        CHOKEPOINTS.forEach((cp, index) => {
            const groundPositions = cp.coordinates.map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat));
            const { lon, lat } = centroid(cp.coordinates);
            const phase = (index / CHOKEPOINTS.length) * Math.PI * 2;
            const latRad = (lat * Math.PI) / 180;
            const metersPerLonDeg = 111_320 * Math.max(0.05, Math.cos(latRad));
            const metersPerLatDeg = 110_574;

            // --- Ground footprint: scrolling tech-grid pattern ---
            const gridFill = new GridMaterialProperty({
                color: new CallbackProperty((time: JulianDate | undefined) => {
                    const t = time ? JulianDate.secondsDifference(time, epochJd) : 0;
                    const wave = 0.5 + 0.5 * Math.sin((t / PULSE_PERIOD_S) * Math.PI * 2 + phase);
                    return BASE_COLOR.withAlpha(0.45 + wave * 0.25);
                }, false),
                cellAlpha: 0.08,
                lineCount: new ConstantProperty(new Cartesian2(10, 10)),
                lineThickness: new ConstantProperty(new Cartesian2(1.6, 1.6)),
                lineOffset: new CallbackProperty((time: JulianDate | undefined) => {
                    const t = time ? JulianDate.secondsDifference(time, epochJd) : 0;
                    return new Cartesian2((t * 0.05) % 1, (t * 0.03) % 1);
                }, false),
            });

            ds.entities.add(new Entity({
                id: cp.id,
                name: cp.name,
                polygon: {
                    hierarchy: new ConstantProperty(new PolygonHierarchy(groundPositions)),
                    material: gridFill,
                    outline: false,
                    heightReference: HeightReference.NONE,
                },
            }));

            // --- Extruded hologram walls with ascending stripe scroll ---
            const stripeWall = new StripeMaterialProperty({
                orientation: StripeOrientation.HORIZONTAL,
                evenColor: new CallbackProperty((time: JulianDate | undefined) => {
                    const t = time ? JulianDate.secondsDifference(time, epochJd) : 0;
                    const wave = 0.5 + 0.5 * Math.sin((t / PULSE_PERIOD_S) * Math.PI * 2 + phase);
                    return BASE_COLOR.withAlpha(0.12 + wave * 0.12);
                }, false),
                oddColor: BASE_COLOR.withAlpha(0.02),
                repeat: new ConstantProperty(10),
                offset: new CallbackProperty((time: JulianDate | undefined) => {
                    const t = time ? JulianDate.secondsDifference(time, epochJd) : 0;
                    return (t * 0.15) % 1;
                }, false),
            });

            ds.entities.add(new Entity({
                id: `${cp.id}-wall`,
                name: cp.name,
                polygon: {
                    hierarchy: new ConstantProperty(new PolygonHierarchy(groundPositions)),
                    material: stripeWall,
                    extrudedHeight: WALL_HEIGHT_METERS,
                    closeTop: false,
                    closeBottom: false,
                    outline: false,
                    heightReference: HeightReference.NONE,
                },
            }));

            // --- Pulsing glow outline (ground) ---
            const outlinePositions = [...groundPositions, groundPositions[0]];
            ds.entities.add(new Entity({
                id: `${cp.id}-outline`,
                name: cp.name,
                polyline: {
                    positions: new ConstantProperty(outlinePositions),
                    width: 3,
                    material: new PolylineGlowMaterialProperty({
                        glowPower: new CallbackProperty((time: JulianDate | undefined) => {
                            const t = time ? JulianDate.secondsDifference(time, epochJd) : 0;
                            const wave = 0.5 + 0.5 * Math.sin((t / PULSE_PERIOD_S) * Math.PI * 2 + phase);
                            return 0.22 + wave * 0.30;
                        }, false),
                        color: GLOW_COLOR,
                    }),
                    clampToGround: true,
                },
            }));

            // --- Top outline at WALL_HEIGHT ---
            const topOutlinePositions = cp.coordinates.map(([ln, lt]) => Cartesian3.fromDegrees(ln, lt, WALL_HEIGHT_METERS));
            topOutlinePositions.push(topOutlinePositions[0]);
            ds.entities.add(new Entity({
                id: `${cp.id}-outline-top`,
                name: cp.name,
                polyline: {
                    positions: new ConstantProperty(topOutlinePositions),
                    width: 2,
                    material: new PolylineGlowMaterialProperty({
                        glowPower: 0.4,
                        color: BASE_COLOR.withAlpha(0.6),
                    }),
                },
            }));

            // --- Corner L-brackets at polygon bounding box ---
            const lons = cp.coordinates.map((c) => c[0]);
            const lats = cp.coordinates.map((c) => c[1]);
            const minLon = Math.min(...lons);
            const maxLon = Math.max(...lons);
            const minLat = Math.min(...lats);
            const maxLat = Math.max(...lats);
            const brkFrac = 0.18;
            const brkLon = (maxLon - minLon) * brkFrac;
            const brkLat = (maxLat - minLat) * brkFrac;
            const corners = [
                { ln: minLon, lt: maxLat, dx: 1, dy: -1, name: 'nw' },
                { ln: maxLon, lt: maxLat, dx: -1, dy: -1, name: 'ne' },
                { ln: minLon, lt: minLat, dx: 1, dy: 1, name: 'sw' },
                { ln: maxLon, lt: minLat, dx: -1, dy: 1, name: 'se' },
            ];
            for (const c of corners) {
                ds.entities.add(new Entity({
                    id: `${cp.id}-bracket-${c.name}`,
                    name: cp.name,
                    polyline: {
                        positions: new ConstantProperty([
                            Cartesian3.fromDegrees(c.ln + brkLon * c.dx, c.lt, 300),
                            Cartesian3.fromDegrees(c.ln, c.lt, 300),
                            Cartesian3.fromDegrees(c.ln, c.lt + brkLat * c.dy, 300),
                        ]),
                        width: 2,
                        material: new PolylineGlowMaterialProperty({
                            glowPower: 0.3,
                            color: BASE_COLOR.withAlpha(0.9),
                        }),
                    },
                }));
            }

            // --- Compass rose: 12 radial tick marks at centroid ---
            const compassR = compassRadiusMeters(cp.width_km);
            const innerTick = compassR * 0.25;
            for (let i = 0; i < 12; i++) {
                const angle = (i / 12) * Math.PI * 2;
                const inR = i % 3 === 0 ? innerTick * 0.0 : innerTick;
                const outR = i % 3 === 0 ? compassR * 0.55 : compassR * 0.38;
                const dlon_in = (Math.cos(angle) * inR) / metersPerLonDeg;
                const dlat_in = (Math.sin(angle) * inR) / metersPerLatDeg;
                const dlon_out = (Math.cos(angle) * outR) / metersPerLonDeg;
                const dlat_out = (Math.sin(angle) * outR) / metersPerLatDeg;
                ds.entities.add(new Entity({
                    id: `${cp.id}-tick-${i}`,
                    name: cp.name,
                    polyline: {
                        positions: new ConstantProperty([
                            Cartesian3.fromDegrees(lon + dlon_in, lat + dlat_in, 400),
                            Cartesian3.fromDegrees(lon + dlon_out, lat + dlat_out, 400),
                        ]),
                        width: i % 3 === 0 ? 2 : 1,
                        material: BASE_COLOR.withAlpha(i % 3 === 0 ? 0.9 : 0.55),
                    },
                }));
            }

            // --- Two concentric rings at centroid ---
            const centroidCart = Cartesian3.fromDegrees(lon, lat, 0);
            for (const [ringIdx, radiusFrac] of [[0, 0.35], [1, 0.7]]) {
                const r = compassR * (radiusFrac as number);
                ds.entities.add(new Entity({
                    id: `${cp.id}-ring-${ringIdx}`,
                    name: cp.name,
                    position: centroidCart,
                    ellipse: {
                        semiMajorAxis: r,
                        semiMinorAxis: r,
                        fill: false,
                        outline: true,
                        outlineColor: BASE_COLOR.withAlpha(0.55),
                        outlineWidth: 1,
                        heightReference: HeightReference.CLAMP_TO_GROUND,
                    },
                }));
            }

            // --- Marching-ants dashed line across the long axis (traffic vector) ---
            const traffSpanLon = maxLon - minLon;
            const traffSpanLat = maxLat - minLat;
            const horizontal = traffSpanLon >= traffSpanLat;
            const axisStart: [number, number] = horizontal ? [minLon, lat] : [lon, minLat];
            const axisEnd: [number, number] = horizontal ? [maxLon, lat] : [lon, maxLat];
            ds.entities.add(new Entity({
                id: `${cp.id}-axis`,
                name: cp.name,
                polyline: {
                    positions: new ConstantProperty([
                        Cartesian3.fromDegrees(axisStart[0], axisStart[1], 200),
                        Cartesian3.fromDegrees(axisEnd[0], axisEnd[1], 200),
                    ]),
                    width: 1.5,
                    material: new PolylineDashMaterialProperty({
                        color: BASE_COLOR.withAlpha(0.75),
                        dashLength: 16,
                    }),
                },
            }));

            // --- Rotating radar sweep ---
            const sweepR = sweepRadiusMeters(cp.width_km);
            const sweepPositions = new CallbackProperty((time: JulianDate | undefined) => {
                const t = time ? JulianDate.secondsDifference(time, epochJd) : 0;
                const angle = (t / SWEEP_ROTATION_PERIOD_S) * Math.PI * 2 + phase;
                const dlon = (Math.cos(angle) * sweepR) / metersPerLonDeg;
                const dlat = (Math.sin(angle) * sweepR) / metersPerLatDeg;
                return [
                    Cartesian3.fromDegrees(lon, lat, 500),
                    Cartesian3.fromDegrees(lon + dlon, lat + dlat, 500),
                ];
            }, false);

            ds.entities.add(new Entity({
                id: `${cp.id}-sweep`,
                name: cp.name,
                polyline: {
                    positions: sweepPositions,
                    width: 2,
                    material: new PolylineGlowMaterialProperty({
                        glowPower: 0.55,
                        color: BASE_COLOR.withAlpha(0.85),
                    }),
                },
            }));

            // --- Vertical signal pillar ---
            const pillarPositions = [
                Cartesian3.fromDegrees(lon, lat, 0),
                Cartesian3.fromDegrees(lon, lat, PILLAR_HEIGHT_METERS),
            ];
            ds.entities.add(new Entity({
                id: `${cp.id}-pillar`,
                name: cp.name,
                polyline: {
                    positions: new ConstantProperty(pillarPositions),
                    width: 3,
                    material: new PolylineGlowMaterialProperty({
                        glowPower: new CallbackProperty((time: JulianDate | undefined) => {
                            const t = time ? JulianDate.secondsDifference(time, epochJd) : 0;
                            const wave = 0.5 + 0.5 * Math.sin((t / 1.8) * Math.PI * 2 + phase);
                            return 0.25 + wave * 0.35;
                        }, false),
                        color: BASE_COLOR.withAlpha(0.9),
                    }),
                },
            }));

            // --- HUD label at top of wall ---
            const line2Parts: string[] = [];
            if (cp.dailyShips) line2Parts.push(`${cp.dailyShips}/d`);
            if (cp.width_km) line2Parts.push(cp.width_km < 1 ? `${cp.width_km * 1000}m` : `${cp.width_km}km`);
            const labelText = `⟦ ${cp.shortName.toUpperCase()} ⟧\n${line2Parts.join(' · ')}`;

            ds.entities.add(new Entity({
                id: `${cp.id}-label`,
                name: cp.name,
                position: Cartesian3.fromDegrees(lon, lat, WALL_HEIGHT_METERS + 5_000),
                label: {
                    text: labelText,
                    font: '12px "JetBrains Mono", monospace',
                    fillColor: BASE_COLOR,
                    outlineColor: Color.BLACK.withAlpha(0.9),
                    outlineWidth: 4,
                    style: LabelStyle.FILL_AND_OUTLINE,
                    verticalOrigin: VerticalOrigin.BOTTOM,
                    horizontalOrigin: HorizontalOrigin.CENTER,
                    pixelOffset: new Cartesian2(0, -8),
                    scaleByDistance: LABEL_SCALE,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                },
            }));

            // --- Pulse rings at centroid, rate scaled to daily traffic ---
            const intervalMs = pulseIntervalMs(cp.dailyShips);
            const maxRadius = pulseRadiusMeters(cp.width_km);

            const spawn = () => {
                if (!pulseDsRef.current) return;
                if (!dataSourceRef.current?.show) return;
                spawnPulseRing(pulseDsRef.current, centroidCart, BASE_COLOR, 1600, maxRadius);
                viewer.scene.requestRender();
            };

            const initialDelay = (index * intervalMs) / CHOKEPOINTS.length;
            const kickoff = window.setTimeout(() => {
                spawn();
                const timer = window.setInterval(spawn, intervalMs);
                pulseTimersRef.current.push(timer);
            }, initialDelay);
            pulseTimersRef.current.push(kickoff);
        });

        setLayerCount('chokepoints', CHOKEPOINTS.length);
        viewer.scene.requestRender();

        return () => {
            for (const t of pulseTimersRef.current) {
                window.clearTimeout(t);
                window.clearInterval(t);
            }
            pulseTimersRef.current = [];
            if (!viewer.isDestroyed()) {
                viewer.dataSources.remove(ds, true);
                viewer.dataSources.remove(pulseDs, true);
            }
            dataSourceRef.current = null;
            pulseDsRef.current = null;
        };
    }, [viewer, setLayerCount]);

    useEffect(() => {
        if (dataSourceRef.current) dataSourceRef.current.show = visible;
        if (pulseDsRef.current) {
            pulseDsRef.current.show = visible;
            if (!visible) pulseDsRef.current.entities.removeAll();
        }
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [visible, viewer]);

    return null;
}
