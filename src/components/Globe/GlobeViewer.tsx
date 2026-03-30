import { useRef, useEffect, useState, type ReactNode } from 'react';
import {
    Viewer, Color, Ion, Entity, CameraEventType, Cartesian2, Cartesian3,
    ScreenSpaceEventHandler, ScreenSpaceEventType, defined,
    UrlTemplateImageryProvider, Math as CesiumMath,
} from 'cesium';
import { reverseGeocode } from '@/services/geocoding';
import { ViewerProvider } from '@/context/ViewerContext';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { type PopupContent } from '@/types/popup';

interface GlobeViewerProps {
    children?: ReactNode;
    onSelect?: (popup: PopupContent | null) => void;
}

export function GlobeViewer({ children, onSelect }: GlobeViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const initRef = useRef(false);
    const [viewer, setViewer] = useState<Viewer | null>(null);
    const { resolve } = usePopupRegistry();
    const onSelectRef = useRef(onSelect);
    onSelectRef.current = onSelect;
    const resolveRef = useRef(resolve);
    resolveRef.current = resolve;

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

        // Dark theme
        scene.backgroundColor = Color.fromCssColorString('#0a0a0f');
        scene.globe.baseColor = Color.fromCssColorString('#12121a');
        scene.globe.enableLighting = true;

        // Label overlay — CartoDB Dark Matter (labels only)
        const labelProvider = new UrlTemplateImageryProvider({
            url: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
            subdomains: 'abcd',
            credit: 'CartoDB',
        });
        const labelLayer = v.imageryLayers.addImageryProvider(labelProvider);
        labelLayer.alpha = 0.85;

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
            if (pendingDelta !== 0) {
                zoomVelocity += pendingDelta * 0.001;
                zoomVelocity = Math.max(-0.4, Math.min(0.4, zoomVelocity));
                pendingDelta = 0;
            }
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

    return (
        <ViewerProvider value={viewer}>
            <div ref={containerRef} className="h-full w-full" />
            {viewer && children}
        </ViewerProvider>
    );
}
