import { useEffect, useRef } from 'react';
import {
    CustomDataSource,
    Entity,
    Cartesian3,
    Color,
    ConstantProperty,
    ColorMaterialProperty,
    PolylineGraphics,
    HeightReference,
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { useViewport } from '@/hooks/useViewport';
import { fetchPowerData } from '@/services/osmFeatures';
import { type PowerData } from '@/types/osmFeatures';

const COLOR = '#FFD700';
const C = Color.fromCssColorString(COLOR);

const SUBSTATION_SVG = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
  <rect x="2" y="2" width="14" height="14" rx="2" fill="${COLOR}" stroke="#000" stroke-width="0.8" opacity="0.9"/>
  <text x="9" y="13" text-anchor="middle" font-size="10" font-family="sans-serif" fill="#000" font-weight="bold">⚡</text>
</svg>`)}`;

const PLANT_SVG = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
  <rect x="1" y="1" width="20" height="20" rx="3" fill="${COLOR}" stroke="#000" stroke-width="1" opacity="0.9"/>
  <rect x="5" y="8" width="4" height="9" fill="#000" opacity="0.6"/>
  <rect x="13" y="8" width="4" height="9" fill="#000" opacity="0.6"/>
  <rect x="4" y="5" width="6" height="4" rx="1" fill="#000" opacity="0.4"/>
  <rect x="12" y="5" width="6" height="4" rx="1" fill="#000" opacity="0.4"/>
</svg>`)}`;

export function PowerLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const visible = isVisible('power');
    const viewport = useViewport(viewer, 2000);
    const dsRef = useRef<CustomDataSource | null>(null);
    const dataRef = useRef<PowerData>({ lines: [], substations: [], plants: [] });

    // Popup builder
    useEffect(() => {
        register('power', (entity: Entity) => {
            if (!dsRef.current?.entities.contains(entity)) return null;
            const id = entity.id as string;
            const sub = dataRef.current.substations.find((s) => s.id === id);
            if (sub) {
                return {
                    title: sub.name || 'Transformatorstasjon',
                    icon: '⚡',
                    color: COLOR,
                    fields: [
                        ...(sub.tags.operator ? [{ label: 'Operatør', value: sub.tags.operator }] : []),
                        ...(sub.tags.voltage ? [{ label: 'Spenning', value: `${sub.tags.voltage} V` }] : []),
                        { label: 'Kilde', value: 'OpenStreetMap' },
                    ],
                };
            }
            const plant = dataRef.current.plants.find((p) => p.id === id);
            if (plant) {
                return {
                    title: plant.name || 'Kraftverk',
                    icon: '⚡',
                    color: COLOR,
                    fields: [
                        ...(plant.tags.operator ? [{ label: 'Operatør', value: plant.tags.operator }] : []),
                        ...(plant.tags['plant:source'] ? [{ label: 'Kilde', value: plant.tags['plant:source'] }] : []),
                        ...(plant.tags['plant:output:electricity'] ? [{ label: 'Effekt', value: plant.tags['plant:output:electricity'] }] : []),
                        { label: 'Datakilde', value: 'OpenStreetMap' },
                    ],
                };
            }
            const line = dataRef.current.lines.find((l) => l.id === id);
            if (line) {
                return {
                    title: line.name || 'Kraftledning',
                    icon: '⚡',
                    color: COLOR,
                    fields: [
                        ...(line.tags.voltage ? [{ label: 'Spenning', value: `${line.tags.voltage} V` }] : []),
                        ...(line.tags.operator ? [{ label: 'Operatør', value: line.tags.operator }] : []),
                        ...(line.tags.cables ? [{ label: 'Kabler', value: line.tags.cables }] : []),
                        { label: 'Datakilde', value: 'OpenStreetMap' },
                    ],
                };
            }
            return null;
        });
        return () => unregister('power');
    }, [register, unregister]);

    // Tooltip builder
    useEffect(() => {
        tooltipRegister('power', (entity: Entity) => {
            if (!dsRef.current?.entities.contains(entity)) return null;
            const id = entity.id as string;
            const sub = dataRef.current.substations.find((s) => s.id === id);
            if (sub) return { title: sub.name || 'Transformatorstasjon', subtitle: sub.tags.voltage ? `${sub.tags.voltage} V` : undefined, icon: '⚡', color: COLOR };
            const plant = dataRef.current.plants.find((p) => p.id === id);
            if (plant) return { title: plant.name || 'Kraftverk', subtitle: plant.tags['plant:source'], icon: '⚡', color: COLOR };
            const line = dataRef.current.lines.find((l) => l.id === id);
            if (line) return { title: line.name || 'Kraftledning', subtitle: line.tags.voltage ? `${line.tags.voltage} V` : undefined, icon: '⚡', color: COLOR };
            return null;
        });
        return () => tooltipUnregister('power');
    }, [tooltipRegister, tooltipUnregister]);

    // Create data source
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('power');
        viewer.dataSources.add(ds);
        dsRef.current = ds;
        return () => {
            if (!viewer.isDestroyed()) viewer.dataSources.remove(ds, true);
            dsRef.current = null;
        };
    }, [viewer]);

    // Toggle visibility
    useEffect(() => {
        if (dsRef.current) dsRef.current.show = visible;
    }, [visible]);

    // Fetch and render on viewport change
    useEffect(() => {
        if (!visible || !viewport || !dsRef.current) return;
        let cancelled = false;
        setLayerLoading('power', true);

        fetchPowerData(viewport).then((data) => {
            if (cancelled || !dsRef.current) return;
            dataRef.current = data;
            const ds = dsRef.current;

            const existing = new Map<string, Entity>();
            for (const entity of ds.entities.values) existing.set(entity.id, entity);
            const seen = new Set<string>();

            // Power lines
            for (const line of data.lines) {
                try {
                    seen.add(line.id);
                    if (existing.has(line.id)) continue;
                    const positions = line.positions
                        .filter(([lon, lat]) => isFinite(lon) && isFinite(lat))
                        .map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat));
                    if (positions.length < 2) continue;
                    ds.entities.add(new Entity({
                        id: line.id,
                        name: line.name || 'Kraftledning',
                        polyline: new PolylineGraphics({
                            positions,
                            width: new ConstantProperty(1.5),
                            material: new ColorMaterialProperty(C.withAlpha(0.6)),
                        }),
                    }));
                } catch { /* skip bad geometry */ }
            }

            // Substations
            for (const sub of data.substations) {
                try {
                    if (!isFinite(sub.lon) || !isFinite(sub.lat)) continue;
                    seen.add(sub.id);
                    if (!existing.has(sub.id)) {
                        ds.entities.add(new Entity({
                            id: sub.id,
                            name: sub.name || 'Transformatorstasjon',
                            position: Cartesian3.fromDegrees(sub.lon, sub.lat, 0),
                            billboard: {
                                image: SUBSTATION_SVG,
                                width: new ConstantProperty(18),
                                height: new ConstantProperty(18),
                                heightReference: new ConstantProperty(HeightReference.CLAMP_TO_GROUND),
                            },
                        }));
                    }
                } catch { /* skip */ }
            }

            // Power plants
            for (const plant of data.plants) {
                try {
                    if (!isFinite(plant.lon) || !isFinite(plant.lat)) continue;
                    seen.add(plant.id);
                    if (!existing.has(plant.id)) {
                        ds.entities.add(new Entity({
                            id: plant.id,
                            name: plant.name || 'Kraftverk',
                            position: Cartesian3.fromDegrees(plant.lon, plant.lat, 0),
                            billboard: {
                                image: PLANT_SVG,
                                width: new ConstantProperty(22),
                                height: new ConstantProperty(22),
                                heightReference: new ConstantProperty(HeightReference.CLAMP_TO_GROUND),
                            },
                        }));
                    }
                } catch { /* skip */ }
            }

            for (const [id] of existing) {
                if (!seen.has(id)) ds.entities.removeById(id);
            }

            const total = data.lines.length + data.substations.length + data.plants.length;
            setLayerCount('power', total);
            setLayerLoading('power', false);
            if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
        }).catch(() => setLayerLoading('power', false));

        return () => { cancelled = true; };
    }, [visible, viewport, viewer, setLayerLoading, setLayerCount]);

    return null;
}
