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
import { fetchHarborData } from '@/services/osmFeatures';
import { type HarborData } from '@/types/osmFeatures';

const COLOR = '#1E88E5';
const C = Color.fromCssColorString(COLOR);

const HARBOR_SVG = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
  <circle cx="10" cy="5" r="3" fill="${COLOR}" stroke="#000" stroke-width="0.6"/>
  <line x1="10" y1="8" x2="10" y2="16" stroke="${COLOR}" stroke-width="2" stroke-linecap="round"/>
  <line x1="4" y1="11" x2="16" y2="11" stroke="${COLOR}" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M5 16 Q10 19 15 16" stroke="${COLOR}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
</svg>`)}`;

const FERRY_SVG = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
  <rect x="3" y="8" width="14" height="7" rx="2" fill="${COLOR}" stroke="#000" stroke-width="0.6"/>
  <rect x="6" y="5" width="8" height="4" rx="1" fill="${COLOR}" stroke="#000" stroke-width="0.6" opacity="0.8"/>
  <path d="M1 15 Q10 18 19 15" stroke="${COLOR}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
</svg>`)}`;

export function HarborLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const visible = isVisible('harbors');
    const viewport = useViewport(viewer, 2000);
    const dsRef = useRef<CustomDataSource | null>(null);
    const dataRef = useRef<HarborData>({ terminals: [], piers: [] });

    useEffect(() => {
        register('harbors', (entity: Entity) => {
            if (!dsRef.current?.entities.contains(entity)) return null;
            const id = entity.id as string;
            const terminal = dataRef.current.terminals.find((t) => t.id === id);
            if (terminal) {
                const isFerry = terminal.tags.amenity === 'ferry_terminal';
                return {
                    title: terminal.name || (isFerry ? 'Ferjeterminal' : 'Havn'),
                    icon: '⚓',
                    color: COLOR,
                    fields: [
                        ...(isFerry ? [{ label: 'Type', value: 'Ferjeterminal' }] : []),
                        ...(terminal.tags.operator ? [{ label: 'Operatør', value: terminal.tags.operator }] : []),
                        ...(terminal.tags.website ? [{ label: 'Nettside', value: terminal.tags.website }] : []),
                        { label: 'Kilde', value: 'OpenStreetMap' },
                    ],
                };
            }
            const pier = dataRef.current.piers.find((p) => p.id === id);
            if (pier) {
                return {
                    title: pier.name || 'Kai',
                    icon: '⚓',
                    color: COLOR,
                    fields: [
                        ...(pier.tags.operator ? [{ label: 'Operatør', value: pier.tags.operator }] : []),
                        { label: 'Kilde', value: 'OpenStreetMap' },
                    ],
                };
            }
            return null;
        });
        return () => unregister('harbors');
    }, [register, unregister]);

    useEffect(() => {
        tooltipRegister('harbors', (entity: Entity) => {
            if (!dsRef.current?.entities.contains(entity)) return null;
            const id = entity.id as string;
            const terminal = dataRef.current.terminals.find((t) => t.id === id);
            if (terminal) {
                const isFerry = terminal.tags.amenity === 'ferry_terminal';
                return { title: terminal.name || (isFerry ? 'Ferjeterminal' : 'Havn'), subtitle: terminal.tags.operator, icon: '⚓', color: COLOR };
            }
            const pier = dataRef.current.piers.find((p) => p.id === id);
            if (pier) return { title: pier.name || 'Kai', icon: '⚓', color: COLOR };
            return null;
        });
        return () => tooltipUnregister('harbors');
    }, [tooltipRegister, tooltipUnregister]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('harbors');
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
        setLayerLoading('harbors', true);

        fetchHarborData(viewport).then((data) => {
            if (cancelled || !dsRef.current) return;
            dataRef.current = data;
            const ds = dsRef.current;
            ds.entities.removeAll();

            // Piers (polylines)
            for (const pier of data.piers) {
                try {
                    const positions = pier.positions
                        .filter(([lon, lat]) => isFinite(lon) && isFinite(lat))
                        .map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat));
                    if (positions.length < 2) continue;
                    ds.entities.add(new Entity({
                        id: pier.id,
                        name: pier.name || 'Kai',
                        polyline: new PolylineGraphics({
                            positions,
                            width: new ConstantProperty(3),
                            material: new ColorMaterialProperty(C.withAlpha(0.8)),
                        }),
                    }));
                } catch { /* skip */ }
            }

            // Terminals (billboards)
            for (const terminal of data.terminals) {
                try {
                    if (!isFinite(terminal.lon) || !isFinite(terminal.lat)) continue;
                    const isFerry = terminal.tags.amenity === 'ferry_terminal';
                    ds.entities.add(new Entity({
                        id: terminal.id,
                        name: terminal.name || (isFerry ? 'Ferjeterminal' : 'Havn'),
                        position: Cartesian3.fromDegrees(terminal.lon, terminal.lat, 0),
                        billboard: {
                            image: isFerry ? FERRY_SVG : HARBOR_SVG,
                            width: new ConstantProperty(20),
                            height: new ConstantProperty(20),
                            heightReference: new ConstantProperty(HeightReference.CLAMP_TO_GROUND),
                        },
                    }));
                } catch { /* skip */ }
            }

            const total = data.terminals.length + data.piers.length;
            setLayerCount('harbors', total);
            setLayerLoading('harbors', false);
            if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
        }).catch(() => setLayerLoading('harbors', false));

        return () => { cancelled = true; };
    }, [visible, viewport, viewer, setLayerLoading, setLayerCount]);

    return null;
}
