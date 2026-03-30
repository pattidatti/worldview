import { useEffect, useRef } from 'react';
import { Cesium3DTileset } from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';

export function BuildingsLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerError } = useLayers();
    const visible = isVisible('buildings');
    const tilesetRef = useRef<Cesium3DTileset | null>(null);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        let cancelled = false;

        async function apply() {
            if (!visible) {
                if (tilesetRef.current) tilesetRef.current.show = false;
                viewer!.scene.requestRender();
                return;
            }

            setLayerLoading('buildings', true);
            try {
                if (!tilesetRef.current) {
                    const tileset = await Cesium3DTileset.fromIonAssetId(96188);
                    if (cancelled) return;
                    tilesetRef.current = tileset;
                    viewer!.scene.primitives.add(tileset);
                }
                tilesetRef.current.show = true;
            } catch (e) {
                if (cancelled) return;
                console.warn(
                    '[WorldView] OSM Buildings (asset 96188) utilgjengelig.\n' +
                    'Legg til asset ID 96188 i Cesium Ion-kontoen din på ion.cesium.com/assetdepot\n',
                    e
                );
                setLayerError('buildings', 'Legg til asset 96188 i Cesium Ion');
            } finally {
                if (!cancelled) setLayerLoading('buildings', false);
            }

            if (!cancelled) viewer!.scene.requestRender();
        }

        apply();
        return () => { cancelled = true; };
    }, [viewer, visible, setLayerLoading, setLayerError]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (tilesetRef.current && viewer && !viewer.isDestroyed()) {
                viewer.scene.primitives.remove(tilesetRef.current);
            }
        };
    }, [viewer]);

    return null;
}
