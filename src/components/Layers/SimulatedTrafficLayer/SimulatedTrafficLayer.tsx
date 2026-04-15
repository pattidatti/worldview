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
    Math as CesiumMath,
} from 'cesium';
import { type Viewport } from '@/hooks/useViewport';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';
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
    HIGHWAY_LABELS,
} from './carUtils';
import { type RoadSegment, type CarState } from '@/types/simulatedTraffic';

const MAX_CAMERA_HEIGHT = 30_000; // 30 km
const TOMTOM_POLL_MS = 90_000;

export function SimulatedTrafficLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } =
        useLayers();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const visible = isVisible('simulatedTraffic');
    const viewport = useViewport(viewer);

    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const carStatesRef = useRef<Map<string, CarState>>(new Map());
    const segmentsRef = useRef<Map<string, RoadSegment>>(new Map());
    const speedZonesRef = useRef<Map<string, number>>(new Map());
    const viewportRef = useRef(viewport);
    viewportRef.current = viewport;
    const visibleRef = useRef(visible);
    visibleRef.current = visible;

    const [segments, setSegments] = useState<RoadSegment[]>([]);
    const [isBelowAlt, setIsBelowAlt] = useState(false);

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

    // Camera altitude monitor — fires on camera.changed AND camera.moveEnd (fallback)
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const check = () => {
            if (viewer.isDestroyed()) return;
            const h = viewer.camera.positionCartographic.height;
            setIsBelowAlt(h < MAX_CAMERA_HEIGHT);
        };
        check();
        const removeChanged = viewer.camera.changed.addEventListener(check);
        const removeMoveEnd = viewer.camera.moveEnd.addEventListener(check);
        return () => {
            removeChanged();
            removeMoveEnd();
        };
    }, [viewer]);

    // Control visibility gate
    useEffect(() => {
        if (dataSourceRef.current) {
            dataSourceRef.current.show = visible && isBelowAlt;
        }
    }, [visible, isBelowAlt]);

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
                        disableDepthTestDistance: Number.POSITIVE_INFINITY,
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

    // Dead-reckoning: advance each car along its road segment every frame
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;

        const handle = viewer.scene.preRender.addEventListener(() => {
            const ds = dataSourceRef.current;
            if (!ds?.show) return;

            const nowMs = Date.now();

            for (const car of carStatesRef.current.values()) {
                const seg = segmentsRef.current.get(car.segmentId);
                if (!seg || seg.positions.length < 2) continue;

                const elapsedS = (nowMs - car.lastFrameMs) / 1000;
                if (elapsedS <= 0 || elapsedS > 5) {
                    car.lastFrameMs = nowMs;
                    continue;
                }

                const distM = car.baseSpeedMs * car.speedFactor * elapsedS;
                car.fraction += distM / (seg.legLengths[car.legIndex] || 1);

                // Advance to next legs if needed (safety counter prevents infinite loop)
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

                const lon = p0[0] + (p1[0] - p0[0]) * car.fraction;
                const lat = p0[1] + (p1[1] - p0[1]) * car.fraction;
                const terrainAlt = viewer.scene.globe.getHeight(
                    Cartographic.fromDegrees(lon, lat),
                ) ?? 5;

                const entity = ds.entities.getById(car.id);
                if (entity?.position) {
                    (entity.position as ConstantPositionProperty).setValue(
                        Cartesian3.fromDegrees(lon, lat, terrainAlt + 2),
                    );
                }
            }
        });

        return () => handle();
    }, [viewer]);

    // rAF loop: drives rendering at ~60fps while cars are visible
    useEffect(() => {
        if (!visible || !isBelowAlt || !viewer) return;
        let rafId: number;
        const tick = () => {
            if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafId);
    }, [visible, isBelowAlt, viewer]);

    return null;
}
