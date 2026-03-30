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
import { fetchLighthouseData } from '@/services/osmFeatures';
import { type LighthouseData } from '@/types/osmFeatures';

const COLOR = '#FF8F00';

const LIGHTHOUSE_SVG = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="24" viewBox="0 0 20 24">
  <polygon points="7,20 13,20 12,8 8,8" fill="${COLOR}" stroke="#000" stroke-width="0.6"/>
  <rect x="6" y="18" width="8" height="3" rx="1" fill="${COLOR}" stroke="#000" stroke-width="0.6"/>
  <rect x="7.5" y="5" width="5" height="4" rx="1" fill="${COLOR}" stroke="#000" stroke-width="0.5"/>
  <circle cx="10" cy="7" r="2" fill="#fff" opacity="0.9"/>
  <line x1="10" y1="5" x2="10" y2="2" stroke="${COLOR}" stroke-width="1" stroke-linecap="round"/>
  <line x1="10" y1="5" x2="13" y2="3" stroke="${COLOR}" stroke-width="0.8" stroke-linecap="round" opacity="0.7"/>
  <line x1="10" y1="5" x2="7" y2="3" stroke="${COLOR}" stroke-width="0.8" stroke-linecap="round" opacity="0.7"/>
</svg>`)}`;

export function LighthouseLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const visible = isVisible('lighthouses');
    const viewport = useViewport(viewer, 2000);
    const dsRef = useRef<CustomDataSource | null>(null);
    const dataRef = useRef<LighthouseData>({ lighthouses: [] });

    useEffect(() => {
        register('lighthouses', (entity: Entity) => {
            if (!dsRef.current?.entities.contains(entity)) return null;
            const id = entity.id as string;
            const lh = dataRef.current.lighthouses.find((x) => x.id === id);
            if (!lh) return null;
            return {
                title: lh.name || 'Fyrtårn',
                icon: '🔦',
                color: COLOR,
                fields: [
                    ...(lh.tags.operator ? [{ label: 'Operatør', value: lh.tags.operator }] : []),
                    ...(lh.tags['seamark:light:range'] ? [{ label: 'Rekkevidde', value: `${lh.tags['seamark:light:range']} nm` }] : []),
                    ...(lh.tags['seamark:light:character'] ? [{ label: 'Lyskode', value: lh.tags['seamark:light:character'] }] : []),
                    ...(lh.tags.height ? [{ label: 'Høyde', value: `${lh.tags.height} m` }] : []),
                    { label: 'Kilde', value: 'OpenStreetMap' },
                ],
            };
        });
        return () => unregister('lighthouses');
    }, [register, unregister]);

    useEffect(() => {
        tooltipRegister('lighthouses', (entity: Entity) => {
            if (!dsRef.current?.entities.contains(entity)) return null;
            const id = entity.id as string;
            const lh = dataRef.current.lighthouses.find((x) => x.id === id);
            if (!lh) return null;
            return { title: lh.name || 'Fyrtårn', subtitle: lh.tags.operator, icon: '🔦', color: COLOR };
        });
        return () => tooltipUnregister('lighthouses');
    }, [tooltipRegister, tooltipUnregister]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('lighthouses');
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
        setLayerLoading('lighthouses', true);

        fetchLighthouseData(viewport).then((data) => {
            if (cancelled || !dsRef.current) return;
            dataRef.current = data;
            const ds = dsRef.current;
            ds.entities.removeAll();

            for (const lh of data.lighthouses) {
                try {
                    if (!isFinite(lh.lon) || !isFinite(lh.lat)) continue;
                    ds.entities.add(new Entity({
                        id: lh.id,
                        name: lh.name || 'Fyrtårn',
                        position: Cartesian3.fromDegrees(lh.lon, lh.lat, 0),
                        billboard: {
                            image: LIGHTHOUSE_SVG,
                            width: new ConstantProperty(20),
                            height: new ConstantProperty(24),
                            heightReference: new ConstantProperty(HeightReference.CLAMP_TO_GROUND),
                        },
                    }));
                } catch { /* skip */ }
            }

            setLayerCount('lighthouses', data.lighthouses.length);
            setLayerLoading('lighthouses', false);
            if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
        }).catch(() => setLayerLoading('lighthouses', false));

        return () => { cancelled = true; };
    }, [visible, viewport, viewer, setLayerLoading, setLayerCount]);

    return null;
}
