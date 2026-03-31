import { useEffect, useRef } from 'react';
import { GeoJsonDataSource, Color, JulianDate } from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';

export function SubmarineCableLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount, setLayerError } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const dsRef = useRef<GeoJsonDataSource | null>(null);
    const visible = isVisible('submarineCables');

    // Register popup builder
    useEffect(() => {
        register('submarineCables', (entity) => {
            if (!dsRef.current?.entities.contains(entity)) return null;
            const props = entity.properties;
            if (!props) return null;
            const name = props.name?.getValue(JulianDate.now()) ?? 'Sjøkabel';
            const operator = props.operator?.getValue(JulianDate.now()) ?? '';
            const color = props.color?.getValue(JulianDate.now()) ?? '#00d4ff';

            return {
                title: name,
                icon: '🌊',
                color,
                fields: [
                    ...(operator ? [{ label: 'Operatør', value: operator }] : []),
                ],
            };
        });
        return () => unregister('submarineCables');
    }, [register, unregister]);

    // Register tooltip builder
    useEffect(() => {
        tooltipRegister('submarineCables', (entity) => {
            if (!dsRef.current?.entities.contains(entity)) return null;
            const props = entity.properties;
            const name = props?.name?.getValue(JulianDate.now()) ?? 'Sjøkabel';
            const color = props?.color?.getValue(JulianDate.now()) ?? '#00d4ff';
            return { title: name, icon: '🌊', color };
        });
        return () => tooltipUnregister('submarineCables');
    }, [tooltipRegister, tooltipUnregister]);

    // Load/show/hide data
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        let cancelled = false;

        async function apply() {
            if (!visible) {
                if (dsRef.current) dsRef.current.show = false;
                viewer!.scene.requestRender();
                return;
            }

            if (dsRef.current) {
                dsRef.current.show = true;
                viewer!.scene.requestRender();
                return;
            }

            setLayerLoading('submarineCables', true);
            try {
                const ds = await GeoJsonDataSource.load('/data/submarine-cables.geojson', {
                    stroke: Color.fromCssColorString('#00d4ff').withAlpha(0.85),
                    strokeWidth: 3,
                    clampToGround: false,
                    describe: () => undefined, // suppress default info box
                });
                if (cancelled) return;
                dsRef.current = ds;
                await viewer!.dataSources.add(ds);
                setLayerCount('submarineCables', ds.entities.values.length);

                // Apply individual cable colors from properties
                for (const entity of ds.entities.values) {
                    const color = entity.properties?.color?.getValue(JulianDate.now());
                    if (color && entity.polyline) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        entity.polyline.material = Color.fromCssColorString(color).withAlpha(0.85) as any;
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        entity.polyline.width = 2 as any;
                    }
                }
            } catch (e) {
                if (cancelled) return;
                if (import.meta.env.DEV) console.error('[SubmarineCableLayer]', e);
                setLayerError('submarineCables', 'Feil ved lasting av sjøkabler');
            } finally {
                if (!cancelled) setLayerLoading('submarineCables', false);
            }

            if (!cancelled) viewer!.scene.requestRender();
        }

        apply();
        return () => { cancelled = true; };
    }, [viewer, visible, setLayerLoading, setLayerCount, setLayerError]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (dsRef.current && viewer && !viewer.isDestroyed()) {
                viewer.dataSources.remove(dsRef.current, true);
            }
        };
    }, [viewer]);

    return null;
}
