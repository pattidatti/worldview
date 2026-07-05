import { useRef, useEffect, useState, type ReactNode } from 'react';
import {
    Viewer, Color, Ion, Entity, CameraEventType, Cartesian2, Cartesian3,
    ScreenSpaceEventHandler, ScreenSpaceEventType, defined,
    UrlTemplateImageryProvider, Math as CesiumMath, Cesium3DTileset, ImageryLayer,
    JulianDate, HeadingPitchRange, Matrix4, PostProcessStage, SceneMode, Cartographic,
    WebMercatorProjection,
} from 'cesium';
import { reverseGeocode } from '@/services/geocoding';
import { ViewerProvider } from '@/context/ViewerContext';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useGates } from '@/context/GateContext';
import { useImagery } from '@/context/ImageryContext';
import { useSceneProjection } from '@/context/SceneProjectionContext';
import { useTracking } from '@/context/TrackingContext';
import { useOrbit } from '@/context/OrbitContext';
import { useShaderOverlay } from '@/context/ShaderOverlayContext';
import { springInEntity, isSpringAnimating } from '@/utils/springEntities';
import { renderScheduler } from '@/core/RenderScheduler';
import { viewportService } from '@/core/ViewportService';
import { lodGovernor } from '@/core/LODGovernor';
import { pickRouter } from '@/core/pickRouter';
import { applyTilesetPerformanceTuning } from '@/utils/tilesetPerformance';
import { NIGHT_VISION_SHADER } from '@/shaders/nightVision';
import { CRT_SHADER } from '@/shaders/crt';
import { THERMAL_SHADER } from '@/shaders/thermal';
import { ANIME_SHADER } from '@/shaders/anime';
import { TERMINATOR_DAY_SHADER } from '@/shaders/terminatorDay';
import { type PopupContent } from '@/types/popup';
import { useWASDNavigation } from '@/hooks/useWASDNavigation';

const ORBIT_PITCH = -0.7;   // rad ≈ -40°, spionfly-vinkel

// Fjerner kun GlobeViewers egne baselayers — overlay-lag (trafikkflyt osv.) overlever
function clearBaseLayers(v: Viewer, tracked: ImageryLayer[]) {
    for (const layer of tracked) {
        if (v.imageryLayers.contains(layer)) v.imageryLayers.remove(layer, true);
    }
    tracked.length = 0;
}

function applySatelliteImagery(v: Viewer, tracked: ImageryLayer[]) {
    clearBaseLayers(v, tracked);
    tracked.push(v.imageryLayers.addImageryProvider(new UrlTemplateImageryProvider({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        credit: 'Esri, Maxar, Earthstar Geographics',
    }), 0));
}

function applyMapImagery(v: Viewer, tracked: ImageryLayer[]) {
    clearBaseLayers(v, tracked);
    tracked.push(v.imageryLayers.addImageryProvider(new UrlTemplateImageryProvider({
        url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        subdomains: 'abcd',
        credit: 'CartoDB',
    }), 0));
}

function applyBlendImagery(v: Viewer, tracked: ImageryLayer[]) {
    clearBaseLayers(v, tracked);
    tracked.push(v.imageryLayers.addImageryProvider(new UrlTemplateImageryProvider({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        credit: 'Esri, Maxar',
    }), 0));
    const roads = v.imageryLayers.addImageryProvider(new UrlTemplateImageryProvider({
        url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png',
        subdomains: 'abcd',
        credit: 'CartoDB',
    }), 1);
    roads.alpha = 0.45;
    tracked.push(roads);
}

function applyCountryLabelsOverlay(v: Viewer, tracked: ImageryLayer[]) {
    const layer = v.imageryLayers.addImageryProvider(new UrlTemplateImageryProvider({
        url: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png',
        subdomains: 'abcd',
        credit: 'CartoDB',
    }));
    layer.alpha = 0.75;
    tracked.push(layer);
}

interface GlobeViewerProps {
    children?: ReactNode;
    onSelect?: (popup: PopupContent | null) => void;
    onEntitySelect?: (entity: Entity | undefined) => void;
    onBackgroundClick?: (lat: number, lon: number) => void;
}

export function GlobeViewer({ children, onSelect, onEntitySelect, onBackgroundClick }: GlobeViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const initRef = useRef(false);
    const [viewer, setViewer] = useState<Viewer | null>(null);
    const { resolve } = usePopupRegistry();
    const { isDrawingRef } = useGates();
    const { activeMode, setMode } = useImagery();
    const { is2D } = useSceneProjection();
    const activeModeRef = useRef(activeMode);
    activeModeRef.current = activeMode;
    const is2DRef = useRef(is2D);
    is2DRef.current = is2D;
    const { activeOverlay } = useShaderOverlay();
    const { trackedEntityId, setTrackedEntityId } = useTracking();
    const { orbitActive, setOrbitActive, orbitSpeed } = useOrbit();
    useWASDNavigation(viewer, orbitActive);
    const tilesetRef = useRef<Cesium3DTileset | null>(null);
    const baseLayersRef = useRef<ImageryLayer[]>([]);
    // Cache én stage per shader-type — toggle enabled i stedet for destroy/recreate
    const shaderStageMapRef = useRef<Map<string, PostProcessStage>>(new Map());
    const activeShaderKeyRef = useRef<string>('none');
    const onSelectRef = useRef(onSelect);
    onSelectRef.current = onSelect;
    const onEntitySelectRef = useRef(onEntitySelect);
    onEntitySelectRef.current = onEntitySelect;
    const onBackgroundClickRef = useRef(onBackgroundClick);
    onBackgroundClickRef.current = onBackgroundClick;
    const resolveRef = useRef(resolve);
    resolveRef.current = resolve;
    const trackedIdRef = useRef(trackedEntityId);
    trackedIdRef.current = trackedEntityId;
    const setTrackedIdRef = useRef(setTrackedEntityId);
    setTrackedIdRef.current = setTrackedEntityId;
    const trackDistRef = useRef(500_000);
    const morphTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Cacher forrige vellykkede (trackedId, dataSource) par slik at preRender
    // slipper å itere alle dataSources per frame. Tilbakestilles når id endres eller
    // entiteten forsvinner.
    const trackedEntityCacheRef = useRef<{ id: string; dsIndex: number } | null>(null);
    const orbitActiveRef = useRef(false);
    const orbitTargetRef = useRef<Cartesian3 | null>(null);
    const orbitDistRef = useRef(500_000);
    const orbitHeadingRef = useRef(0);
    const orbitLastTimeMsRef = useRef(0);
    const orbitSpeedRef = useRef(orbitSpeed);
    orbitActiveRef.current = orbitActive;
    orbitSpeedRef.current = orbitSpeed;

    useEffect(() => {
        if (!containerRef.current || initRef.current) return;
        initRef.current = true;

        Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN || '';

        const v = new Viewer(containerRef.current, {
            timeline: false,
            animation: false,
            baseLayerPicker: false,
            geocoder: false,
            homeButton: false,
            sceneModePicker: false,
            selectionIndicator: false,
            navigationHelpButton: false,
            fullscreenButton: false,
            infoBox: false,
            requestRenderMode: true,
            maximumRenderTimeChange: 10,
            // Tving CSS-piksel-rendering: HiDPI-skjermer rendrer ellers 2-4x flere fragments
            // for samme synlige resultat. Knapt synlig på 1080p, dramatisk vinst på Retina/WSL2.
            useBrowserRecommendedResolution: false,
            mapProjection: new WebMercatorProjection(),
            // DepthPlane ellers klipper entiteter ved altitude 0 i SCENE3D.
            // Sett til -500 slik at alle entiteter ≥ -500m passerer depth test.
            depthPlaneEllipsoidOffset: -500,
        });

        const { scene } = v;

        // Fjern default Bing/Ion-lag som Viewer-konstruktøren legger til automatisk.
        // Uten dette vil det default-laget havne over våre baselayers (høyere indeks = øverst).
        v.imageryLayers.removeAll(true);

        // DepthPlane blokkerer lavtliggende entiteter i SCENE3D uavhengig av offset.
        // Erstatter med no-op for å sikre at skip, fly m.m. alltid er synlige over havet.
        (scene as any)._depthPlane = { update: () => {}, execute: () => {} };

        v.camera.percentageChanged = 0.2;

        // Dark theme
        scene.backgroundColor = Color.fromCssColorString('#0a0a0f');
        scene.globe.baseColor = Color.fromCssColorString('#12121a');
        // Lighting: skrudd av — Photorealistic 3D Tiles har innbakt globalt lys, og
        // standard imagery (satellite/map/blend) ser bedre ut uten ekstra dag/natt-skygge
        // som blokkerer entiteter på nattsiden. Stor fragment-shader-vinst.
        scene.globe.enableLighting = false;
        // FXAA: skrudd av — full-screen post-process som koster en GPU-pass per frame.
        // Knapt synlig på moderne høy-DPI displays, merkbar perf-vinst på integrert GPU/WSL2.
        scene.postProcessStages.fxaa.enabled = false;

        // Stjernehimmel og atmosfære — gir romfølelse
        if (scene.skyAtmosphere) {
            scene.skyAtmosphere.show = true;
            scene.skyAtmosphere.hueShift = 0.05;      // svak neon-tint
            scene.skyAtmosphere.saturationShift = 0.3;
        }
        scene.fog.enabled = false;
        if (scene.skyBox) scene.skyBox.show = true;   // Cesium standardstjerner
        if (scene.sun) scene.sun.show = true;
        if (scene.moon) scene.moon.show = false;       // månen beholder vi skjult

        // Zoom — egen handler med zoom-mot-markør og momentum
        const controller = scene.screenSpaceCameraController;
        controller.enableZoom = true;
        controller.minimumZoomDistance = 50;
        controller.maximumZoomDistance = 50_000_000;
        controller.zoomEventTypes = [
            CameraEventType.RIGHT_DRAG,
            CameraEventType.PINCH,
        ];

        let pendingDelta = 0;
        let zoomVelocity = 0;
        let cursorWorldPos: Cartesian3 | undefined;
        const pickScratch = new Cartesian2();
        const dirScratch = new Cartesian3();
        const projScratch1 = new Cartesian3();
        const projScratch2 = new Cartesian3();
        const orbitHprScratch = new HeadingPitchRange(0, ORBIT_PITCH, 500_000);
        const trackHprScratch = new HeadingPitchRange(0, CesiumMath.toRadians(-45), 500_000);
        const julianDateScratch = new JulianDate();
        const cartographicScratch = new Cartographic();

        v.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            pendingDelta += -e.deltaY;

            pickScratch.x = e.offsetX;
            pickScratch.y = e.offsetY;
            const picked = v.camera.pickEllipsoid(pickScratch, scene.globe.ellipsoid);
            if (picked) cursorWorldPos = Cartesian3.clone(picked);

            scene.requestRender();
        }, { passive: false });

        // Konsolidert preRender-handler: zoom-momentum, kamera-tracking, orbit-rotasjon
        // og shader-driven re-render i én listener. Reduserer event-dispatch overhead
        // og lar oss styre rekkefølgen eksplisitt.
        scene.preRender.addEventListener(() => {
            const tracking = trackedIdRef.current;

            // Orbit-rotasjon kun når orbit-modus uten tracked entity
            if (!tracking && orbitActiveRef.current && orbitTargetRef.current) {
                const now = performance.now();
                const dt = orbitLastTimeMsRef.current === 0 ? 0 : Math.min((now - orbitLastTimeMsRef.current) / 16.67, 3);
                orbitLastTimeMsRef.current = now;
                orbitHeadingRef.current += orbitSpeedRef.current * dt;
                orbitHprScratch.heading = orbitHeadingRef.current;
                orbitHprScratch.range = orbitDistRef.current;
                v.camera.lookAt(orbitTargetRef.current, orbitHprScratch);
                scene.requestRender();
            }

            if (pendingDelta !== 0) {
                if (tracking) {
                    // While following: scroll adjusts distance instead of moving camera
                    trackDistRef.current *= (1 - pendingDelta * 0.0008);
                    trackDistRef.current = Math.max(500, Math.min(20_000_000, trackDistRef.current));
                    pendingDelta = 0;
                    zoomVelocity = 0;
                } else if (orbitActiveRef.current) {
                    // While orbiting: scroll adjusts orbit radius
                    orbitDistRef.current *= (1 - pendingDelta * 0.0008);
                    orbitDistRef.current = Math.max(500, Math.min(20_000_000, orbitDistRef.current));
                    pendingDelta = 0;
                    zoomVelocity = 0;
                } else {
                    zoomVelocity += pendingDelta * 0.001;
                    zoomVelocity = Math.max(-0.4, Math.min(0.4, zoomVelocity));
                    pendingDelta = 0;
                }
            }

            if (!tracking) {
                if (Math.abs(zoomVelocity) < 0.0002) { zoomVelocity = 0; return; }

                const height = v.camera.positionCartographic.height;
                if ((height <= 60 && zoomVelocity > 0) || (height >= 48_000_000 && zoomVelocity < 0)) {
                    zoomVelocity = 0;
                    return;
                }

                const amount = height * zoomVelocity;

                if (scene.mode === SceneMode.SCENE2D) {
                    if (cursorWorldPos) {
                        const cursorCarto = Cartographic.fromCartesian(
                            cursorWorldPos, scene.globe.ellipsoid, cartographicScratch
                        );
                        const camCarto = v.camera.positionCartographic;
                        // Projiser begge til kart-koordinater (WebMercator) for korrekt cursor-sentrert zoom
                        const cursorProj = scene.mapProjection.project(cursorCarto, projScratch1);
                        const camProj = scene.mapProjection.project(camCarto, projScratch2);
                        const dX = cursorProj.x - camProj.x;
                        const dY = cursorProj.y - camProj.y;
                        if (amount > 0) v.camera.zoomIn(amount); else v.camera.zoomOut(-amount);
                        v.camera.moveRight(dX * zoomVelocity);
                        v.camera.moveUp(dY * zoomVelocity);
                    } else {
                        if (amount > 0) v.camera.zoomIn(amount); else v.camera.zoomOut(-amount);
                    }
                } else if (cursorWorldPos) {
                    Cartesian3.subtract(cursorWorldPos, v.camera.position, dirScratch);
                    Cartesian3.normalize(dirScratch, dirScratch);
                    v.camera.move(dirScratch, amount);
                } else {
                    v.camera.move(v.camera.direction, amount);
                }

                zoomVelocity *= 0.85;
                scene.requestRender();
                return;
            }

            // Camera tracking: cached dataSource-lookup, kun lineær fallback når cache bommer.
            const tryApply = (entity: import('cesium').Entity | undefined): boolean => {
                if (!entity?.position) return false;
                const pos = entity.position.getValue(JulianDate.now(julianDateScratch));
                if (!pos) return false;
                if (orbitActiveRef.current) {
                    const now = performance.now();
                    const dt = orbitLastTimeMsRef.current === 0 ? 0 : Math.min((now - orbitLastTimeMsRef.current) / 16.67, 3);
                    orbitLastTimeMsRef.current = now;
                    orbitHeadingRef.current += orbitSpeedRef.current * dt;
                    orbitHprScratch.heading = orbitHeadingRef.current;
                    orbitHprScratch.range = trackDistRef.current;
                    v.camera.lookAt(pos, orbitHprScratch);
                } else {
                    trackHprScratch.heading = v.camera.heading;
                    trackHprScratch.range = trackDistRef.current;
                    v.camera.lookAt(pos, trackHprScratch);
                }
                scene.requestRender();
                return true;
            };

            const cached = trackedEntityCacheRef.current;
            if (cached && cached.id === tracking && cached.dsIndex < v.dataSources.length) {
                const entity = v.dataSources.get(cached.dsIndex).entities.getById(tracking);
                if (tryApply(entity)) return;
            }
            for (let i = 0; i < v.dataSources.length; i++) {
                const entity = v.dataSources.get(i).entities.getById(tracking);
                if (tryApply(entity)) {
                    trackedEntityCacheRef.current = { id: tracking, dsIndex: i };
                    return;
                }
            }
            trackedEntityCacheRef.current = null;
            setTrackedIdRef.current(null);
        });

        // Single centralized click handler
        const removeClickHandler = v.selectedEntityChanged.addEventListener(
            (entity: Entity | undefined) => {
                if (isDrawingRef.current) return;
                onEntitySelectRef.current?.(entity);
                if (!entity) return;
                const popup = resolveRef.current(entity);
                if (popup) onSelectRef.current?.(popup);
            }
        );

        // Click handler — cluster zoom + globe surface reverse geocoding
        const clickHandler = new ScreenSpaceEventHandler(v.canvas);
        clickHandler.setInputAction((click: { position: Cartesian2 }) => {
            if (isDrawingRef.current) return;
            const picked = v.scene.pick(click.position);

            // Regular entity → handled by selectedEntityChanged, skip
            if (defined(picked) && picked.id instanceof Entity) return;

            // Orbital shell picks (fra SatelliteLayer) — la SatelliteLayer håndtere disse
            if (defined(picked) && typeof picked.id === 'string' && picked.id.startsWith('orbital-shell-')) return;

            // Primitive-picks (renderplan-lag) — string-id-er rutet på kanal-prefiks.
            // Må stå FØR cluster-grenen: cluster-billboards pickes også som ikke-Entity.
            if (defined(picked) && pickRouter.route(picked.id, click.position)) return;

            // Cluster billboard → zoom mot det, spring-eksplosjon etter zoom
            if (defined(picked)) {
                const worldPos = v.camera.pickEllipsoid(click.position, scene.globe.ellipsoid);
                if (!worldPos) return;
                const clusterCenter = Cartesian3.clone(worldPos);
                const carto = scene.globe.ellipsoid.cartesianToCartographic(worldPos);
                const targetHeight = v.camera.positionCartographic.height * 0.35;
                v.camera.flyTo({
                    destination: Cartesian3.fromRadians(
                        carto.longitude,
                        carto.latitude,
                        targetHeight,
                    ),
                    duration: 0.8,
                    complete: () => {
                        // Spring-animer entities som nettopp ble frigjort fra clusteret
                        const scanRadius = targetHeight * 2.5;
                        for (let i = 0; i < v.dataSources.length; i++) {
                            const ds = v.dataSources.get(i);
                            if (!ds.clustering?.enabled) continue;
                            for (const entity of ds.entities.values) {
                                if (!entity.position || isSpringAnimating(entity)) continue;
                                const pos = entity.position.getValue(JulianDate.now());
                                if (!pos) continue;
                                if (Cartesian3.distance(pos, clusterCenter) < scanRadius) {
                                    springInEntity(entity, clusterCenter, Cartesian3.clone(pos), v);
                                }
                            }
                        }
                    },
                });
                return;
            }

            // Empty globe click → intelligence panel (country) or reverse geocode
            const worldPos = v.camera.pickEllipsoid(click.position, scene.globe.ellipsoid);
            if (!worldPos) return;
            const carto = scene.globe.ellipsoid.cartesianToCartographic(worldPos);
            const lat = CesiumMath.toDegrees(carto.latitude);
            const lon = CesiumMath.toDegrees(carto.longitude);

            if (onBackgroundClickRef.current) {
                onBackgroundClickRef.current(lat, lon);
                return;
            }

            reverseGeocode(lat, lon).then((result) => {
                if (!result) return;
                const title = result.city
                    ? `${result.city}, ${result.country}`
                    : result.country || result.name;
                const fields: { label: string; value: string }[] = [];
                if (result.country) fields.push({ label: 'Land', value: result.country });
                if (result.state) fields.push({ label: 'Region', value: result.state });
                if (result.county) fields.push({ label: 'Kommune', value: result.county });
                if (result.city) fields.push({ label: 'By', value: result.city });
                fields.push({ label: 'Koordinater', value: `${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E` });
                onSelectRef.current?.({
                    title,
                    icon: '\uD83D\uDCCD',
                    color: '#8899aa',
                    fields,
                    linkUrl: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=10/${lat}/${lon}`,
                    linkLabel: 'Vis i OpenStreetMap',
                });
            });
        }, ScreenSpaceEventType.LEFT_CLICK);

        // Fly til brukerens posisjon, fallback til Norge
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                v.camera.flyTo({
                    destination: Cartesian3.fromDegrees(
                        pos.coords.longitude,
                        pos.coords.latitude,
                        500_000
                    ),
                    duration: 1.5,
                });
            },
            () => {
                v.camera.flyTo({
                    destination: Cartesian3.fromDegrees(10.75, 59.91, 2_000_000),
                    duration: 1.5,
                });
            },
            { timeout: 5000 }
        );

        v.scene.globe.show = false;
        renderScheduler.attach(v);
        viewportService.attach(v);
        lodGovernor.attach(v);
        setViewer(v);

        return () => {
            lodGovernor.detach();
            viewportService.detach();
            renderScheduler.detach();
            removeClickHandler();
            if (!clickHandler.isDestroyed()) clickHandler.destroy();
            if (!v.isDestroyed()) {
                v.destroy();
            }
            setViewer(null);
            initRef.current = false;
        };
        // isDrawingRef is a stable useRef — reading its .current inside handlers is intentional.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Camera lock/unlock when tracking changes
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        if (!trackedEntityId) {
            viewer.camera.lookAtTransform(Matrix4.IDENTITY);
            setOrbitActive(false);
        } else {
            // Finn entitetens nåværende høyde for å bestemme kameraavstand
            // Satellitter (>100km) trenger mye større avstand enn skip/fly
            let entityAltM = 0;
            for (let i = 0; i < viewer.dataSources.length; i++) {
                const entity = viewer.dataSources.get(i).entities.getById(trackedEntityId);
                if (entity?.position) {
                    const pos = entity.position.getValue(JulianDate.now());
                    if (pos) {
                        const carto = viewer.scene.globe.ellipsoid.cartesianToCartographic(pos);
                        entityAltM = carto?.height ?? 0;
                    }
                    break;
                }
            }
            // Satellitter (alt > 100 km): orbit på 15% av høyden; ellers standard 1 km
            trackDistRef.current = entityAltM > 100_000
                ? Math.max(50_000, entityAltM * 0.15)
                : 1_000;
            orbitHeadingRef.current = viewer.camera.heading;
            setOrbitActive(true);
        }
        viewer.scene.requestRender();
    }, [trackedEntityId, viewer, setOrbitActive]);

    // Orbit aktivering/deaktivering
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        if (orbitActive) {
            if (!trackedIdRef.current) {
                // Normal orbit: capture screen-center as fixed target
                const canvas = viewer.scene.canvas;
                const center = new Cartesian2(canvas.width / 2, canvas.height / 2);
                const target =
                    viewer.scene.pickPosition(center) ??
                    viewer.camera.pickEllipsoid(center) ??
                    viewer.scene.globe.ellipsoid.cartographicToCartesian(
                        viewer.camera.positionCartographic
                    );
                orbitTargetRef.current = target ?? null;
                orbitDistRef.current = target
                    ? Cartesian3.distance(viewer.camera.position, target)
                    : viewer.camera.positionCartographic.height;
            }
            // Always seed heading and timestamp from current camera (prevents first-frame jerk)
            orbitHeadingRef.current = viewer.camera.heading;
            orbitLastTimeMsRef.current = performance.now();
        } else {
            orbitLastTimeMsRef.current = 0;
            viewer.camera.lookAtTransform(Matrix4.IDENTITY);
            orbitTargetRef.current = null;
        }
        viewer.scene.requestRender();
    }, [orbitActive, viewer]);

    // Imagery-switching effect
    useEffect(() => {
        if (!viewer) return;
        let cancelled = false;
        const { scene } = viewer;

        async function apply() {
            if (activeMode === 'photorealistic3d') {
                // photorealistic3d støttes ikke i 2D-modus — fall tilbake til map
                if (is2DRef.current) {
                    scene.globe.show = true;
                    if (tilesetRef.current) tilesetRef.current.show = false;
                    applyMapImagery(viewer!, baseLayersRef.current);
                    if (!cancelled) scene.requestRender();
                    return;
                }
                scene.globe.show = false;

                if (!tilesetRef.current) {
                    try {
                        const tileset = await Cesium3DTileset.fromIonAssetId(2275207);
                        if (cancelled) return;
                        applyTilesetPerformanceTuning(tileset);
                        tilesetRef.current = tileset;
                        scene.primitives.add(tileset);
                    } catch (e) {
                        if (import.meta.env.DEV) console.warn(
                            '[WorldView] Google Photorealistic 3D Tiles utilgjengelig.\n' +
                            'Legg til asset ID 2275207 i Cesium Ion-kontoen din på ion.cesium.com/assetdepot\n',
                            e
                        );
                        if (!cancelled) {
                            scene.globe.show = true;
                            applySatelliteImagery(viewer!, baseLayersRef.current);
                        }
                    }
                } else {
                    tilesetRef.current.show = true;
                }
            } else {
                scene.globe.show = true;
                if (tilesetRef.current) tilesetRef.current.show = false;

                if (activeMode === 'satellite') {
                    applySatelliteImagery(viewer!, baseLayersRef.current);
                    applyCountryLabelsOverlay(viewer!, baseLayersRef.current);
                } else if (activeMode === 'map') {
                    applyMapImagery(viewer!, baseLayersRef.current);
                } else if (activeMode === 'blend') {
                    applyBlendImagery(viewer!, baseLayersRef.current);
                    applyCountryLabelsOverlay(viewer!, baseLayersRef.current);
                }
            }

            if (!cancelled) scene.requestRender();
        }

        apply();
        return () => { cancelled = true; };
    }, [viewer, activeMode]);

    // Shader overlay effect — gjenbruker stages via cache (ingen destroy/recreate per toggle)
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const { scene } = viewer;
        const stageMap = shaderStageMapRef.current;

        // Deaktiver forrige stage
        const prevKey = activeShaderKeyRef.current;
        if (prevKey !== 'none') {
            const prev = stageMap.get(prevKey);
            if (prev) prev.enabled = false;
        }
        activeShaderKeyRef.current = activeOverlay;

        if (activeOverlay !== 'none') {
            let stage = stageMap.get(activeOverlay);
            if (!stage) {
                const src = activeOverlay === 'nightvision' ? NIGHT_VISION_SHADER
                          : activeOverlay === 'crt'         ? CRT_SHADER
                          : activeOverlay === 'anime'       ? ANIME_SHADER
                          : activeOverlay === 'terminator'  ? TERMINATOR_DAY_SHADER
                          : THERMAL_SHADER;
                stage = new PostProcessStage({
                    fragmentShader: src,
                    uniforms: { u_time: () => performance.now() / 1000 },
                });
                scene.postProcessStages.add(stage);
                stageMap.set(activeOverlay, stage);
            }
            stage.enabled = true;
        }

        scene.requestRender();

        // u_time-animasjon drives av et 30fps-intervall i stedet for selv-skedulerende
        // requestRender i preRender. Det halverer frame-raten for shader-animasjonen og
        // hindrer at en aktiv effekt låser hele scenen i kontinuerlig 60fps-rendering.
        if (activeOverlay !== 'none') {
            const id = window.setInterval(() => {
                if (!viewer.isDestroyed()) scene.requestRender();
            }, 33);
            return () => clearInterval(id);
        }
    }, [viewer, activeOverlay]);

    // 2D/3D projeksjonstoggle
    useEffect(() => {
        if (!viewer) return;
        if (morphTimeoutRef.current) clearTimeout(morphTimeoutRef.current);

        if (is2D) {
            if (activeModeRef.current === 'photorealistic3d') setMode('map');
            if (trackedIdRef.current) setTrackedIdRef.current(null);

            const { scene } = viewer;
            scene.backgroundColor = Color.fromCssColorString('#060810');
            scene.globe.baseColor = Color.fromCssColorString('#0d1b2a');
            if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;
            if (scene.skyBox) scene.skyBox.show = false;
            if (scene.sun) scene.sun.show = false;

            viewer.scene.morphTo2D(1.0);
            scene.screenSpaceCameraController.enableLook = false;

            morphTimeoutRef.current = setTimeout(() => {
                if (viewer.isDestroyed()) return;
                const camCarto = viewer.camera.positionCartographic;
                const lon = CesiumMath.toDegrees(camCarto.longitude);
                const lat = CesiumMath.toDegrees(camCarto.latitude);
                viewer.camera.flyTo({
                    destination: Cartesian3.fromDegrees(lon, lat, 18_000_000),
                    duration: 1.2,
                });
            }, 1100);
        } else {
            const { scene } = viewer;
            scene.backgroundColor = Color.fromCssColorString('#0a0a0f');
            scene.globe.baseColor = Color.fromCssColorString('#12121a');
            if (scene.skyAtmosphere) {
                scene.skyAtmosphere.show = true;
                scene.skyAtmosphere.hueShift = 0.05;
                scene.skyAtmosphere.saturationShift = 0.3;
            }
            if (scene.skyBox) scene.skyBox.show = true;
            if (scene.sun) scene.sun.show = true;
            viewer.scene.morphTo3D(1.5);
            scene.screenSpaceCameraController.enableLook = true;
        }
    }, [viewer, is2D]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <ViewerProvider value={viewer}>
            <div ref={containerRef} className="h-full w-full" />
            {viewer && children}
        </ViewerProvider>
    );
}
