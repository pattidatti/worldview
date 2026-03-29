import { useRef, useEffect, useState, type ReactNode } from 'react';
import { Viewer, Color, Ion } from 'cesium';
import { ViewerProvider } from '@/context/ViewerContext';

interface GlobeViewerProps {
    children?: ReactNode;
}

export function GlobeViewer({ children }: GlobeViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [viewer, setViewer] = useState<Viewer | null>(null);

    useEffect(() => {
        if (!containerRef.current || viewer) return;

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
        });

        const { scene } = v;

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

        setViewer(v);

        return () => {
            if (!v.isDestroyed()) {
                v.destroy();
            }
            setViewer(null);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <ViewerProvider value={viewer}>
            <div ref={containerRef} className="h-full w-full" />
            {viewer && children}
        </ViewerProvider>
    );
}
