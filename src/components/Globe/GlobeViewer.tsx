import { useRef, useEffect, useState, type ReactNode } from 'react';
import {
    Viewer, Color, Ion, Entity, CameraEventType, Cartesian2, Cartesian3,
    ScreenSpaceEventHandler, ScreenSpaceEventType, defined,
    UrlTemplateImageryProvider, Math as CesiumMath, Cesium3DTileset, ImageryLayer,
    JulianDate, HeadingPitchRange, Matrix4, PostProcessStage,
} from 'cesium';
import { reverseGeocode } from '@/services/geocoding';
import { ViewerProvider } from '@/context/ViewerContext';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useImagery } from '@/context/ImageryContext';
import { useTracking } from '@/context/TrackingContext';
import { useOrbit } from '@/context/OrbitContext';
import { useShaderOverlay } from '@/context/ShaderOverlayContext';
import { NIGHT_VISION_SHADER } from '@/shaders/nightVision';
import { CRT_SHADER } from '@/shaders/crt';
import { THERMAL_SHADER } from '@/shaders/thermal';
import { ANIME_SHADER } from '@/shaders/anime';
import { type PopupContent } from '@/types/popup';

const ORBIT_SPEED = 0.003;  // rad/frame ≈ 3.5 min per omgang
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
    const lbl = v.imageryLayers.addImageryProvider(new UrlTemplateImageryProvider({
        url: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png',
        subdomains: 'abcd',
        credit: 'CartoDB',
    }), 1);
    lbl.alpha = 0.5;
    tracked.push(lbl);
}

function applyMapImagery(v: Viewer, tracked: ImageryLayer[]) {
    clearBaseLayers(v, tracked);
    tracked.push(v.imageryLayers.addImageryProvider(new UrlTemplateImageryProvider({
        url: 'https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png',
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
    const lbl = v.imageryLayers.addImageryProvider(new UrlTemplateImageryProvider({
        url: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png',
        subdomains: 'abcd',
        credit: 'CartoDB',
    }), 2);
    lbl.alpha = 0.5;
    tracked.push(lbl);
}

interface GlobeViewerProps {
    children?: ReactNode;
    onSelect?: (popup: PopupContent | null) => void;
}

export function GlobeViewer({ children, onSelect }: GlobeViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const initRef = useRef(false);
    const [viewer, setViewer] = useState<Viewer | null>(null);
    const { resolve } = usePopupRegistry();
    const { activeMode } = useImagery();
    const { activeOverlay } = useShaderOverlay();
    const { trackedEntityId, setTrackedEntityId } = useTracking();
    const { orbitActive, setOrbitActive } = useOrbit();
    const tilesetRef = useRef<Cesium3DTileset | null>(null);
    const baseLayersRef = useRef<ImageryLayer[]>([]);
    const shaderStageRef = useRef<PostProcessStage | null>(null);
    const onSelectRef = useRef(onSelect);
    onSelectRef.current = onSelect;
    const resolveRef = useRef(resolve);
    resolveRef.current = resolve;
    const trackedIdRef = useRef(trackedEntityId);
    trackedIdRef.current = trackedEntityId;
    const setTrackedIdRef = useRef(setTrackedEntityId);
    setTrackedIdRef.current = setTrackedEntityId;
    const trackDistRef = useRef(500_000);
    const orbitActiveRef = useRef(false);
    const orbitTargetRef = useRef<Cartesian3 | null>(null);
    const orbitDistRef = useRef(500_000);
    const orbitHeadingRef = useRef(0);
    orbitActiveRef.current = orbitActive;

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
        });

        const { scene } = v;

        v.camera.percentageChanged = 0.2;

        // Dark theme
        scene.backgroundColor = Color.fromCssColorString('#0a0a0f');
        scene.globe.baseColor = Color.fromCssColorString('#12121a');
        scene.globe.enableLighting = true;

        // Clean dark sky
        if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;
        scene.fog.enabled = false;
        if (scene.skyBox) scene.skyBox.show = false;
        if (scene.sun) scene.sun.show = false;
        if (scene.moon) scene.moon.show = false;

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
        const orbitHprScratch = new HeadingPitchRange(0, ORBIT_PITCH, 500_000);
        const trackHprScratch = new HeadingPitchRange(0, CesiumMath.toRadians(-30), 500_000);
        const julianDateScratch = new JulianDate();
        let orbitLastTimeMs = 0;

        v.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            pendingDelta += -e.deltaY;

            pickScratch.x = e.offsetX;
            pickScratch.y = e.offsetY;
            const picked = v.camera.pickEllipsoid(pickScratch, scene.globe.ellipsoid);
            if (picked) cursorWorldPos = Cartesian3.clone(picked);

            scene.requestRender();
        }, { passive: false });

        scene.preRender.addEventListener(() => {
            const tracking = trackedIdRef.current;

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
                if (cursorWorldPos) {
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

            // Camera tracking: find entity in all dataSources and lock camera onto it
            for (let i = 0; i < v.dataSources.length; i++) {
                const entity = v.dataSources.get(i).entities.getById(tracking);
                if (entity?.position) {
                    const pos = entity.position.getValue(JulianDate.now(julianDateScratch));
                    if (pos) {
                        if (orbitActiveRef.current) {
                            // Orbit around the moving entity
                            const now = performance.now();
                            const dt = orbitLastTimeMs === 0 ? 1 : Math.min((now - orbitLastTimeMs) / 16.67, 3);
                            orbitLastTimeMs = now;
                            orbitHeadingRef.current += ORBIT_SPEED * dt;
                            orbitHprScratch.heading = orbitHeadingRef.current;
                            orbitHprScratch.range = trackDistRef.current;
                            v.camera.lookAt(pos, orbitHprScratch);
                        } else {
                            // Static-angle follow
                            trackHprScratch.heading = v.camera.heading;
                            trackHprScratch.range = trackDistRef.current;
                            v.camera.lookAt(pos, trackHprScratch);
                        }
                        scene.requestRender();
                    }
                    return;
                }
            }
            // Entity not found — stop tracking
            setTrackedIdRef.current(null);
        });

        // Orbit render loop runs via scene.preRender only while orbitActive (and not tracking)
        scene.preRender.addEventListener(() => {
            if (!orbitActiveRef.current || !orbitTargetRef.current || trackedIdRef.current) return;
            const now = performance.now();
            const dt = orbitLastTimeMs === 0 ? 1 : Math.min((now - orbitLastTimeMs) / 16.67, 3);
            orbitLastTimeMs = now;
            orbitHeadingRef.current += ORBIT_SPEED * dt;
            orbitHprScratch.heading = orbitHeadingRef.current;
            orbitHprScratch.range = orbitDistRef.current;
            v.camera.lookAt(orbitTargetRef.current, orbitHprScratch);
            scene.requestRender();
        });

        // Single centralized click handler
        const removeClickHandler = v.selectedEntityChanged.addEventListener(
            (entity: Entity | undefined) => {
                if (!entity) return;
                const popup = resolveRef.current(entity);
                if (popup) onSelectRef.current?.(popup);
            }
        );

        // Click handler — cluster zoom + globe surface reverse geocoding
        const clickHandler = new ScreenSpaceEventHandler(v.canvas);
        clickHandler.setInputAction((click: { position: Cartesian2 }) => {
            const picked = v.scene.pick(click.position);

            // Regular entity → handled by selectedEntityChanged, skip
            if (defined(picked) && picked.id instanceof Entity) return;

            // Cluster billboard → zoom toward it
            if (defined(picked)) {
                const worldPos = v.camera.pickEllipsoid(click.position, scene.globe.ellipsoid);
                if (!worldPos) return;
                const carto = scene.globe.ellipsoid.cartesianToCartographic(worldPos);
                v.camera.flyTo({
                    destination: Cartesian3.fromRadians(
                        carto.longitude,
                        carto.latitude,
                        v.camera.positionCartographic.height * 0.35,
                    ),
                    duration: 0.8,
                });
                return;
            }

            // Empty globe click → reverse geocode
            const worldPos = v.camera.pickEllipsoid(click.position, scene.globe.ellipsoid);
            if (!worldPos) return;
            const carto = scene.globe.ellipsoid.cartesianToCartographic(worldPos);
            const lat = CesiumMath.toDegrees(carto.latitude);
            const lon = CesiumMath.toDegrees(carto.longitude);

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
        setViewer(v);

        return () => {
            removeClickHandler();
            if (!clickHandler.isDestroyed()) clickHandler.destroy();
            if (!v.isDestroyed()) {
                v.destroy();
            }
            setViewer(null);
            initRef.current = false;
        };
    }, []);

    // Camera lock/unlock when tracking changes
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        if (!trackedEntityId) {
            viewer.camera.lookAtTransform(Matrix4.IDENTITY);
            setOrbitActive(false);
        } else {
            trackDistRef.current = Math.max(500, viewer.camera.positionCartographic.height * 0.5);
            orbitHeadingRef.current = viewer.camera.heading;
            setOrbitActive(true);
        }
        viewer.scene.requestRender();
    }, [trackedEntityId, viewer]);

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
            // Always seed heading from current camera
            orbitHeadingRef.current = viewer.camera.heading;
        } else {
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
                scene.globe.show = false;

                if (!tilesetRef.current) {
                    try {
                        const tileset = await Cesium3DTileset.fromIonAssetId(2275207);
                        if (cancelled) return;
                        tilesetRef.current = tileset;
                        scene.primitives.add(tileset);
                    } catch (e) {
                        console.warn(
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

                if (activeMode === 'satellite') applySatelliteImagery(viewer!, baseLayersRef.current);
                else if (activeMode === 'map') applyMapImagery(viewer!, baseLayersRef.current);
                else if (activeMode === 'blend') applyBlendImagery(viewer!, baseLayersRef.current);
            }

            if (!cancelled) scene.requestRender();
        }

        apply();
        return () => { cancelled = true; };
    }, [viewer, activeMode]);

    // Shader overlay effect
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const { scene } = viewer;

        if (shaderStageRef.current) {
            scene.postProcessStages.remove(shaderStageRef.current);
            if (!shaderStageRef.current.isDestroyed()) shaderStageRef.current.destroy();
            shaderStageRef.current = null;
        }

        if (activeOverlay !== 'none') {
            const src = activeOverlay === 'nightvision' ? NIGHT_VISION_SHADER
                      : activeOverlay === 'crt'         ? CRT_SHADER
                      : activeOverlay === 'anime'        ? ANIME_SHADER
                      : THERMAL_SHADER;
            const stage = new PostProcessStage({ fragmentShader: src });
            scene.postProcessStages.add(stage);
            shaderStageRef.current = stage;
        }

        scene.requestRender();
    }, [viewer, activeOverlay]);

    return (
        <ViewerProvider value={viewer}>
            <div ref={containerRef} className="h-full w-full" />
            {viewer && children}
        </ViewerProvider>
    );
}
