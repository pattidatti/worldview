import { useEffect, useRef } from 'react';
import {
    CustomDataSource,
    Entity,
    Cartesian3,
    ConstantProperty,
    HeightReference,
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { useViewport } from '@/hooks/useViewport';
import { fetchWindData } from '@/services/osmFeatures';
import { type WindData } from '@/types/osmFeatures';

const COLOR = '#4DB6AC';

const TURBINE_SVG = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
  <circle cx="10" cy="10" r="2" fill="${COLOR}" stroke="#000" stroke-width="0.5"/>
  <line x1="10" y1="8" x2="10" y2="1" stroke="${COLOR}" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="10" y1="8" x2="4" y2="13" stroke="${COLOR}" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="10" y1="8" x2="16" y2="13" stroke="${COLOR}" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="10" y1="12" x2="10" y2="19" stroke="${COLOR}" stroke-width="1" stroke-linecap="round" opacity="0.6"/>
</svg>`)}`;

export function WindLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const visible = isVisible('wind');
    const viewport = useViewport(viewer, 2000);
    const dsRef = useRef<CustomDataSource | null>(null);
    const dataRef = useRef<WindData>({ turbines: [] });

    useEffect(() => {
        register('wind', (entity: Entity) => {
            if (!dsRef.current?.entities.contains(entity)) return null;
            const id = entity.id as string;
            const t = dataRef.current.turbines.find((x) => x.id === id);
            if (!t) return null;
            return {
                title: t.name || 'Vindturbin',
                icon: '💨',
                color: COLOR,
                fields: [
                    ...(t.tags.operator ? [{ label: 'Operatør', value: t.tags.operator }] : []),
                    ...(t.tags['generator:output:electricity'] ? [{ label: 'Effekt', value: t.tags['generator:output:electricity'] }] : []),
                    ...(t.tags['generator:type'] ? [{ label: 'Type', value: t.tags['generator:type'] }] : []),
                    ...(t.tags.height ? [{ label: 'Høyde', value: `${t.tags.height} m` }] : []),
                    { label: 'Kilde', value: 'OpenStreetMap' },
                ],
            };
        });
        return () => unregister('wind');
    }, [register, unregister]);

    useEffect(() => {
        tooltipRegister('wind', (entity: Entity) => {
            if (!dsRef.current?.entities.contains(entity)) return null;
            const id = entity.id as string;
            const t = dataRef.current.turbines.find((x) => x.id === id);
            if (!t) return null;
            return { title: t.name || 'Vindturbin', subtitle: t.tags.operator, icon: '💨', color: COLOR };
        });
        return () => tooltipUnregister('wind');
    }, [tooltipRegister, tooltipUnregister]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('wind');
        viewer.dataSources.add(ds);
        dsRef.current = ds;
        return () => {
            if (!viewer.isDestroyed()) viewer.dataSources.remove(ds, true);
            dsRef.current = null;
        };
    }, [viewer]);

    useEffect(() => {
        if (dsRef.current) dsRef.current.show = visible;
    }, [visible]);

    useEffect(() => {
        if (!visible || !viewport || !dsRef.current) return;
        let cancelled = false;
        setLayerLoading('wind', true);

        fetchWindData(viewport).then((data) => {
            if (cancelled || !dsRef.current) return;
            dataRef.current = data;
            const ds = dsRef.current;
            ds.entities.removeAll();

            for (const t of data.turbines) {
                try {
                    if (!isFinite(t.lon) || !isFinite(t.lat)) continue;
                    ds.entities.add(new Entity({
                        id: t.id,
                        name: t.name || 'Vindturbin',
                        position: Cartesian3.fromDegrees(t.lon, t.lat, 0),
                        billboard: {
                            image: TURBINE_SVG,
                            width: new ConstantProperty(20),
                            height: new ConstantProperty(20),
                            heightReference: new ConstantProperty(HeightReference.CLAMP_TO_GROUND),
                        },
                    }));
                } catch { /* skip */ }
            }

            setLayerCount('wind', data.turbines.length);
            setLayerLoading('wind', false);
            if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
        }).catch(() => setLayerLoading('wind', false));

        return () => { cancelled = true; };
    }, [visible, viewport, viewer, setLayerLoading, setLayerCount]);

    return null;
}
