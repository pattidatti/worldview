import { useEffect, useRef, useCallback, useState } from 'react';
import {
    CustomDataSource,
    Entity,
    Cartesian3,
    Cartographic,
    Color,
    ConstantPositionProperty,
    PointGraphics,
    HeightReference,
    BillboardCollection,
    Primitive,
    GeometryInstance,
    BoxGeometry,
    PerInstanceColorAppearance,
    ColorGeometryInstanceAttribute,
    Transforms,
    HeadingPitchRoll,
    Math as CesiumMath,
} from 'cesium';
import { type Viewport } from '@/hooks/useViewport';
import { useViewer } from '@/context/ViewerContext';
import { useCinematic } from '@/context/CinematicContext';
import { useLayerActions, useLayerVisibility } from '@/store/layerStore';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { useViewport } from '@/hooks/useViewport';
import { fetchRoadSegments } from '@/services/osmRoads';
import { fetchTrafficEvents } from '@/services/tomtom-traffic';
import {
    buildCarPool,
    matchIncidentsToSegments,
    speedColor,
    speedColorHex,
    createCarSvgUri,
    HIGHWAY_LABELS,
} from './carUtils';
import { type RoadSegment, type CarState } from '@/types/simulatedTraffic';

const MAX_CAMERA_HEIGHT = 30_000;  // 30 km — laget er ikke aktivt over denne høyden
const BILLBOARD_ALT     = 10_000;  // < 10 km → SVG billboard-biler
const BOX_ALT           =    500;  // < 500 m → 3D boks-biler
const TOMTOM_POLL_MS = 90_000;

type RenderMode = 'point' | 'billboard' | 'box';

// Cache for globe.getHeight per (lat,lon)-grid-celle (~100m oppløsning).
// Biler beveger seg langs faste veger der terrenghøyden er stabil i 30s-vinduer.
// Per-frame-kall til getHeight på 100+ biler er den dyreste delen av DR-loopen.
const HEIGHT_CACHE = new Map<string, { h: number; ts: number }>();
const HEIGHT_TTL_MS = 30_000;
const heightCartoScratch = new Cartographic();
function cachedGlobeHeight(scene: { globe: { getHeight: (c: Cartographic) => number | undefined } }, lon: number, lat: number, fallback: number): number {
    const key = `${Math.round(lon * 1000)}:${Math.round(lat * 1000)}`;
    const now = Date.now();
    const hit = HEIGHT_CACHE.get(key);
    if (hit && now - hit.ts < HEIGHT_TTL_MS) return hit.h;
    Cartographic.fromDegrees(lon, lat, 0, heightCartoScratch);
    const h = scene.globe.getHeight(heightCartoScratch) ?? fallback;
    HEIGHT_CACHE.set(key, { h, ts: now });
    if (HEIGHT_CACHE.size > 5000) {
        // Enkel oppryddingsstrategi: drop første 1000 entries når cache vokser
        const it = HEIGHT_CACHE.keys();
        for (let i = 0; i < 1000; i++) HEIGHT_CACHE.delete(it.next().value as string);
    }
    return h;
}

export function SimulatedTrafficLayer() {
    const viewer = useViewer();
    const { cinematicActiveRef } = useCinematic();
    const { setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } = useLayerActions();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const visible = useLayerVisibility('simulatedTraffic');
    const viewport = useViewport(viewer);

    const dataSourceRef      = useRef<CustomDataSource | null>(null);
    const billboardColRef    = useRef<BillboardCollection | null>(null);
    const boxPrimitiveRef    = useRef<Primitive | null>(null);
    const carStatesRef       = useRef<Map<string, CarState>>(new Map());
    const segmentsRef        = useRef<Map<string, RoadSegment>>(new Map());
    const speedZonesRef      = useRef<Map<string, number>>(new Map());
    const viewportRef        = useRef(viewport);
    viewportRef.current      = viewport;
    const visibleRef         = useRef(visible);
    visibleRef.current       = visible;

    const [segments, setSegments]     = useState<RoadSegment[]>([]);
    const [isBelowAlt, setIsBelowAlt] = useState(false);
    const [renderMode, setRenderMode] = useState<RenderMode>('point');

    // Popup builder
    useEffect(() => {
        register('simulatedTraffic', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const car = carStatesRef.current.get(entity.id);
            if (!car) return null;
            const seg = segmentsRef.current.get(car.segmentId);
            if (!seg) return null;

            const speedKmh = Math.round(car.baseSpeedMs * car.speedFactor * 3.6);
            const status =
                car.speedFactor < 0.3 ? 'Kø' : car.speedFactor < 0.7 ? 'Sakte' : 'Fri flyt';
            const vegtype = HIGHWAY_LABELS[seg.highway] ?? seg.highway;
            const congested = car.speedFactor < 0.7;

            return {
                title: 'Simulert bil',
                icon: '🚙',
                color: speedColorHex(car.speedFactor),
                description: `Kjører på ${seg.name || vegtype} med ${speedKmh} km/t.${congested ? ' Kø i nærheten.' : ''}`,
                fields: [
                    { label: 'Vegtype', value: vegtype },
                    { label: 'Hastighet', value: `${speedKmh} km/t` },
                    { label: 'Trafikkstatus', value: status },
                    { label: 'Kilde', value: 'OpenStreetMap + TomTom' },
                ],
            };
        });
        return () => unregister('simulatedTraffic');
    }, [register, unregister]);

    // Tooltip builder
    useEffect(() => {
        tooltipRegister('simulatedTraffic', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const car = carStatesRef.current.get(entity.id);
            if (!car) return null;
            const seg = segmentsRef.current.get(car.segmentId);
            if (!seg) return null;
            const speedKmh = Math.round(car.baseSpeedMs * car.speedFactor * 3.6);
            return {
                title: 'Simulert bil',
                subtitle: `${speedKmh} km/t · ${seg.name || HIGHWAY_LABELS[seg.highway] || seg.highway}`,
                icon: '🚙',
                color: speedColorHex(car.speedFactor),
            };
        });
        return () => tooltipUnregister('simulatedTraffic');
    }, [tooltipRegister, tooltipUnregister]);

    // Create CustomDataSource
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('simulatedTraffic');
        viewer.dataSources.add(ds);
        dataSourceRef.current = ds;
        return () => {
            if (!viewer.isDestroyed()) viewer.dataSources.remove(ds, true);
            dataSourceRef.current = null;
        };
    }, [viewer]);

    // BillboardCollection for SVG bil-ikoner
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const col = new BillboardCollection({ scene: viewer.scene });
        viewer.scene.primitives.add(col);
        billboardColRef.current = col;
        return () => {
            if (!viewer.isDestroyed()) viewer.scene.primitives.remove(col);
            billboardColRef.current = null;
        };
    }, [viewer]);

    // Camera altitude monitor — oppdaterer isBelowAlt + renderMode
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const check = () => {
            if (viewer.isDestroyed()) return;
            const h = viewer.camera.positionCartographic.height;
            setIsBelowAlt(h < MAX_CAMERA_HEIGHT);
            setRenderMode(h < BOX_ALT ? 'box' : h < BILLBOARD_ALT ? 'billboard' : 'point');
        };
        check();
        const removeChanged = viewer.camera.changed.addEventListener(check);
        const removeMoveEnd = viewer.camera.moveEnd.addEventListener(check);
        return () => {
            removeChanged();
            removeMoveEnd();
        };
    }, [viewer]);

    // Synkroniser synlighet og renderMode mellom datasource / billboards / boxes
    useEffect(() => {
        const active = visible && isBelowAlt;
        if (dataSourceRef.current) {
            // PointGraphics vises kun i 'point'-modus
            dataSourceRef.current.show = active && renderMode === 'point';
        }
        if (billboardColRef.current) {
            billboardColRef.current.show = active && renderMode === 'billboard';
        }
        // Box-primitiven styres av rebuild-intervallet nedenfor
        if (boxPrimitiveRef.current) {
            boxPrimitiveRef.current.show = active && renderMode === 'box';
        }
    }, [visible, isBelowAlt, renderMode]);

    // Poll road segments when viewport changes and layer is active
    useEffect(() => {
        if (!visible || !isBelowAlt || !viewer || viewer.isDestroyed()) return;

        // useViewport has a 1000ms debounce, so viewport may still be null when
        // isBelowAlt first becomes true. Fall back to reading the camera directly.
        const effectiveViewport: Viewport | null = viewport ?? (() => {
            const rect = viewer.camera.computeViewRectangle();
            if (!rect) return null;
            return {
                west: CesiumMath.toDegrees(rect.west),
                south: CesiumMath.toDegrees(rect.south),
                east: CesiumMath.toDegrees(rect.east),
                north: CesiumMath.toDegrees(rect.north),
            };
        })();

        if (!effectiveViewport) return;
        let cancelled = false;

        setLayerLoading('simulatedTraffic', true);
        fetchRoadSegments(effectiveViewport)
            .then((segs) => {
                if (!cancelled) {
                    setSegments(segs);
                    setLayerError('simulatedTraffic', null);
                    setLayerLastUpdated('simulatedTraffic', Date.now());
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setLayerError(
                        'simulatedTraffic',
                        err instanceof Error ? err.message : 'Ukjent feil',
                    );
                }
            })
            .finally(() => {
                if (!cancelled) setLayerLoading('simulatedTraffic', false);
            });

        return () => {
            cancelled = true;
        };
    }, [visible, isBelowAlt, viewport, viewer, setLayerLoading, setLayerError, setLayerLastUpdated]);

    // Poll TomTom events every 90s → update speed zones
    useEffect(() => {
        if (!visible || !isBelowAlt) return;
        let cancelled = false;
        let timerId: ReturnType<typeof setTimeout>;

        const doFetch = async () => {
            const events = await fetchTrafficEvents(viewportRef.current).catch(() => []);
            if (!cancelled) {
                const zones = matchIncidentsToSegments(events, [
                    ...segmentsRef.current.values(),
                ]);
                speedZonesRef.current = zones;
                // Live-update speed factors on existing cars (no full rebuild needed)
                for (const car of carStatesRef.current.values()) {
                    car.speedFactor = zones.get(car.segmentId) ?? 1.0;
                }
                timerId = setTimeout(doFetch, TOMTOM_POLL_MS);
            }
        };

        doFetch();
        return () => {
            cancelled = true;
            clearTimeout(timerId);
        };
    }, [visible, isBelowAlt]);

    // Rebuild car pool when segments arrive
    const rebuildCarPool = useCallback(() => {
        const ds = dataSourceRef.current;
        if (!ds) return;

        ds.entities.removeAll();
        carStatesRef.current.clear();
        segmentsRef.current.clear();

        for (const seg of segments) {
            segmentsRef.current.set(seg.id, seg);
        }

        const cars = buildCarPool(segments, speedZonesRef.current);
        const nowMs = Date.now();

        for (const car of cars) {
            const seg = segmentsRef.current.get(car.segmentId);
            if (!seg || seg.positions.length < 2) continue;

            car.lastFrameMs = nowMs;

            const p0 = seg.positions[car.legIndex];
            const p1 = seg.positions[car.legIndex + 1];
            if (!p0 || !p1) continue;

            const lon = p0[0] + (p1[0] - p0[0]) * car.fraction;
            const lat = p0[1] + (p1[1] - p0[1]) * car.fraction;
            const terrainAlt = (viewer && !viewer.isDestroyed())
                ? (viewer.scene.globe.getHeight(Cartographic.fromDegrees(lon, lat)) ?? 5)
                : 5;

            carStatesRef.current.set(car.id, car);

            ds.entities.add(
                new Entity({
                    id: car.id,
                    position: new ConstantPositionProperty(
                        Cartesian3.fromDegrees(lon, lat, terrainAlt + 2),
                    ),
                    point: new PointGraphics({
                        pixelSize: 8,
                        color: speedColor(car.speedFactor),
                        outlineColor: Color.BLACK,
                        outlineWidth: 1,
                        heightReference: HeightReference.NONE,
                        disableDepthTestDistance: 1.5e7,
                    }),
                }),
            );
        }

        setLayerCount('simulatedTraffic', cars.length);
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [segments, viewer, setLayerCount]);

    useEffect(() => {
        rebuildCarPool();
    }, [rebuildCarPool]);

    // Dead-reckoning: advance each car along vegsegmentet hvert preRender-kall
    // Oppdaterer posisjon i carStates og skriver til riktig render-target
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;

        const handle = viewer.scene.preRender.addEventListener(() => {
            if (cinematicActiveRef.current) return;
            const active = visible && isBelowAlt;
            if (!active) return;

            const nowMs   = Date.now();
            const ds      = dataSourceRef.current;
            const billCol = billboardColRef.current;
            const mode    = renderMode;

            let bilIdx = 0; // billboard index synkronisert med carStates iteration

            for (const car of carStatesRef.current.values()) {
                const seg = segmentsRef.current.get(car.segmentId);
                if (!seg || seg.positions.length < 2) continue;

                const elapsedS = (nowMs - car.lastFrameMs) / 1000;
                if (elapsedS <= 0 || elapsedS > 5) { car.lastFrameMs = nowMs; continue; }

                const distM = car.baseSpeedMs * car.speedFactor * elapsedS;
                car.fraction += distM / (seg.legLengths[car.legIndex] || 1);

                let guard = 0;
                while (car.fraction >= 1.0 && guard++ < 50) {
                    car.fraction -= 1.0;
                    car.legIndex++;
                    if (car.legIndex >= seg.positions.length - 1) {
                        car.legIndex = 0;
                        car.fraction = Math.min(car.fraction, 0.999);
                    }
                }
                car.lastFrameMs = nowMs;

                const p0 = seg.positions[car.legIndex];
                const p1 = seg.positions[car.legIndex + 1];
                if (!p0 || !p1) continue;

                const lon  = p0[0] + (p1[0] - p0[0]) * car.fraction;
                const lat  = p0[1] + (p1[1] - p0[1]) * car.fraction;
                const galt = cachedGlobeHeight(viewer.scene, lon, lat, 2);
                const pos  = Cartesian3.fromDegrees(lon, lat, galt + 1.5);

                if (mode === 'point') {
                    const entity = ds?.entities.getById(car.id);
                    if (entity?.position) {
                        (entity.position as ConstantPositionProperty).setValue(pos);
                    }
                } else if (mode === 'billboard' && billCol && bilIdx < billCol.length) {
                    const b = billCol.get(bilIdx);
                    b.position = pos;
                    b.image    = createCarSvgUri(car.speedFactor);
                    const heading = seg.legHeadings[car.legIndex] ?? 0;
                    b.rotation    = -CesiumMath.toRadians(heading);
                    b.alignedAxis = Cartesian3.normalize(pos, new Cartesian3());
                }

                bilIdx++;
            }
        });

        return () => handle();
    }, [viewer, visible, isBelowAlt, renderMode]); // eslint-disable-line react-hooks/exhaustive-deps

    // Synkroniser antall billboards med antall biler
    useEffect(() => {
        const col = billboardColRef.current;
        if (!col || renderMode !== 'billboard') return;
        const n = carStatesRef.current.size;
        while (col.length < n) {
            col.add({ image: createCarSvgUri(1.0), width: 24, height: 12, show: true, position: Cartesian3.ZERO });
        }
        while (col.length > n) col.remove(col.get(col.length - 1));
    }, [renderMode, segments]);

    // BoxGeometry-rebuild hvert 200ms ved <500m altitudeR
    useEffect(() => {
        if (!viewer || renderMode !== 'box') return;

        const rebuildBoxes = () => {
            if (!viewer || viewer.isDestroyed()) return;
            const { scene } = viewer;
            if (boxPrimitiveRef.current) scene.primitives.remove(boxPrimitiveRef.current);
            boxPrimitiveRef.current = null;

            const instances: GeometryInstance[] = [];
            for (const car of carStatesRef.current.values()) {
                const seg = segmentsRef.current.get(car.segmentId);
                if (!seg) continue;
                const p0 = seg.positions[car.legIndex];
                const p1 = seg.positions[car.legIndex + 1];
                if (!p0 || !p1) continue;

                const lon = p0[0] + (p1[0] - p0[0]) * car.fraction;
                const lat = p0[1] + (p1[1] - p0[1]) * car.fraction;
                const galt = cachedGlobeHeight(scene, lon, lat, 2);
                const pos     = Cartesian3.fromDegrees(lon, lat, galt + 0.75);
                const heading = seg.legHeadings[car.legIndex] ?? 0;

                const modelMatrix = Transforms.headingPitchRollToFixedFrame(
                    pos,
                    new HeadingPitchRoll(CesiumMath.toRadians(90 - heading), 0, 0),
                );

                const c = Color.fromCssColorString(
                    car.speedFactor > 0.6 ? '#00cc44' : car.speedFactor > 0.25 ? '#ffcc00' : '#ff3333'
                );
                instances.push(new GeometryInstance({
                    geometry: new BoxGeometry({
                        minimum: new Cartesian3(-2, -1, 0),
                        maximum: new Cartesian3(2, 1, 1.5),
                    }),
                    modelMatrix,
                    attributes: { color: ColorGeometryInstanceAttribute.fromColor(c) },
                }));
            }

            if (instances.length === 0) return;
            const prim = new Primitive({
                geometryInstances: instances,
                appearance: new PerInstanceColorAppearance({ flat: true }),
                allowPicking: false,
                asynchronous: false,
            });
            scene.primitives.add(prim);
            boxPrimitiveRef.current = prim;
            if (!scene.isDestroyed()) scene.requestRender();
        };

        rebuildBoxes();
        const id = setInterval(rebuildBoxes, 200);
        return () => {
            clearInterval(id);
            if (viewer && !viewer.isDestroyed() && boxPrimitiveRef.current) {
                viewer.scene.primitives.remove(boxPrimitiveRef.current);
                boxPrimitiveRef.current = null;
            }
        };
    }, [viewer, renderMode, segments]);

    // Render-loop: 4fps er tilstrekkelig for simulert veitrafikk
    useEffect(() => {
        if (!visible || !isBelowAlt || !viewer) return;
        const id = setInterval(() => {
            if (!viewer.isDestroyed()) viewer.scene.requestRender();
        }, 250);
        return () => clearInterval(id);
    }, [visible, isBelowAlt, viewer]);

    return null;
}
