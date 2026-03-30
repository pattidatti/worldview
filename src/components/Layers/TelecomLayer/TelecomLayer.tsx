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
import { fetchTelecomData } from '@/services/osmFeatures';
import { type TelecomData } from '@/types/osmFeatures';

const COLOR = '#AB47BC';

const TOWER_SVG = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="18" height="24" viewBox="0 0 18 24">
  <line x1="9" y1="22" x2="9" y2="4" stroke="${COLOR}" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="3" y1="20" x2="9" y2="22" stroke="${COLOR}" stroke-width="1" stroke-linecap="round"/>
  <line x1="15" y1="20" x2="9" y2="22" stroke="${COLOR}" stroke-width="1" stroke-linecap="round"/>
  <line x1="4" y1="14" x2="9" y2="16" stroke="${COLOR}" stroke-width="1" stroke-linecap="round"/>
  <line x1="14" y1="14" x2="9" y2="16" stroke="${COLOR}" stroke-width="1" stroke-linecap="round"/>
  <line x1="6" y1="10" x2="9" y2="11" stroke="${COLOR}" stroke-width="1" stroke-linecap="round"/>
  <line x1="12" y1="10" x2="9" y2="11" stroke="${COLOR}" stroke-width="1" stroke-linecap="round"/>
  <line x1="6" y1="5" x2="12" y2="5" stroke="${COLOR}" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="7" y1="3" x2="11" y2="3" stroke="${COLOR}" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="8.5" y1="1" x2="9.5" y2="1" stroke="${COLOR}" stroke-width="2" stroke-linecap="round"/>
</svg>`)}`;

export function TelecomLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const visible = isVisible('telecom');
    const viewport = useViewport(viewer, 2000);
    const dsRef = useRef<CustomDataSource | null>(null);
    const dataRef = useRef<TelecomData>({ towers: [] });

    useEffect(() => {
        register('telecom', (entity: Entity) => {
            if (!dsRef.current?.entities.contains(entity)) return null;
            const id = entity.id as string;
            const t = dataRef.current.towers.find((x) => x.id === id);
            if (!t) return null;
            return {
                title: t.name || 'Telekomtårn',
                icon: '📡',
                color: COLOR,
                fields: [
                    ...(t.tags.operator ? [{ label: 'Operatør', value: t.tags.operator }] : []),
                    ...(t.tags.height ? [{ label: 'Høyde', value: `${t.tags.height} m` }] : []),
                    ...(t.tags['tower:type'] ? [{ label: 'Type', value: t.tags['tower:type'] }] : []),
                    ...(t.tags['communication:mobile_phone'] === 'yes' ? [{ label: 'Mobiltelefon', value: 'Ja' }] : []),
                    { label: 'Kilde', value: 'OpenStreetMap' },
                ],
            };
        });
        return () => unregister('telecom');
    }, [register, unregister]);

    useEffect(() => {
        tooltipRegister('telecom', (entity: Entity) => {
            if (!dsRef.current?.entities.contains(entity)) return null;
            const id = entity.id as string;
            const t = dataRef.current.towers.find((x) => x.id === id);
            if (!t) return null;
            return { title: t.name || 'Telekomtårn', subtitle: t.tags.operator, icon: '📡', color: COLOR };
        });
        return () => tooltipUnregister('telecom');
    }, [tooltipRegister, tooltipUnregister]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('telecom');
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
        setLayerLoading('telecom', true);

        fetchTelecomData(viewport).then((data) => {
            if (cancelled || !dsRef.current) return;
            dataRef.current = data;
            const ds = dsRef.current;

            const existing = new Map<string, Entity>();
            for (const entity of ds.entities.values) existing.set(entity.id, entity);
            const seen = new Set<string>();

            for (const t of data.towers) {
                try {
                    if (!isFinite(t.lon) || !isFinite(t.lat)) continue;
                    seen.add(t.id);
                    if (!existing.has(t.id)) {
                        ds.entities.add(new Entity({
                            id: t.id,
                            name: t.name || 'Telekomtårn',
                            position: Cartesian3.fromDegrees(t.lon, t.lat, 0),
                            billboard: {
                                image: TOWER_SVG,
                                width: new ConstantProperty(18),
                                height: new ConstantProperty(24),
                                heightReference: new ConstantProperty(HeightReference.CLAMP_TO_GROUND),
                                disableDepthTestDistance: new ConstantProperty(Number.POSITIVE_INFINITY),
                            },
                        }));
                    }
                } catch { /* skip */ }
            }

            for (const [id] of existing) {
                if (!seen.has(id)) ds.entities.removeById(id);
            }

            setLayerCount('telecom', data.towers.length);
            setLayerLoading('telecom', false);
            if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
        }).catch(() => setLayerLoading('telecom', false));

        return () => { cancelled = true; };
    }, [visible, viewport, viewer, setLayerLoading, setLayerCount]);

    return null;
}
