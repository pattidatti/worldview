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
import { fetchMineData } from '@/services/osmFeatures';
import { type MineData } from '@/types/osmFeatures';

const COLOR = '#8D6E63';

const MINE_SVG = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
  <circle cx="10" cy="10" r="8" fill="${COLOR}" stroke="#000" stroke-width="0.8" opacity="0.9"/>
  <line x1="7" y1="13" x2="13" y2="7" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
  <line x1="13" y1="13" x2="7" y2="7" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <circle cx="13" cy="7" r="2" fill="#fff" opacity="0.8"/>
  <line x1="12" y1="5" x2="15" y2="5" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity="0.8"/>
  <line x1="15" y1="5" x2="15" y2="8" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity="0.8"/>
</svg>`)}`;

const QUARRY_SVG = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
  <polygon points="10,2 18,18 2,18" fill="${COLOR}" stroke="#000" stroke-width="0.8" opacity="0.9"/>
  <line x1="10" y1="8" x2="10" y2="14" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="7" y1="14" x2="13" y2="14" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
</svg>`)}`;

export function MineLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const visible = isVisible('mines');
    const viewport = useViewport(viewer, 2000);
    const dsRef = useRef<CustomDataSource | null>(null);
    const dataRef = useRef<MineData>({ mines: [], quarryCentroids: [] });

    useEffect(() => {
        register('mines', (entity: Entity) => {
            if (!dsRef.current?.entities.contains(entity)) return null;
            const id = entity.id as string;
            const mine = dataRef.current.mines.find((x) => x.id === id);
            if (mine) {
                const typeMap: Record<string, string> = { mineshaft: 'Gruveskakt', adit: 'Gruvegang' };
                const typeLabel = typeMap[mine.tags.man_made ?? ''] ?? (mine.tags.industrial === 'mine' ? 'Gruve' : 'Gruve');
                const wikiTag = mine.tags.wikipedia;
                const wikiParts = wikiTag ? wikiTag.split(':') : null;
                const wikiUrl = wikiParts && wikiParts.length >= 2
                    ? `https://${wikiParts[0]}.wikipedia.org/wiki/${wikiParts.slice(1).join(':')}`
                    : undefined;
                return {
                    title: mine.name || typeLabel,
                    icon: '⛏',
                    color: COLOR,
                    fields: [
                        { label: 'Type', value: typeLabel },
                        ...(mine.tags.operator ? [{ label: 'Operatør', value: mine.tags.operator }] : []),
                        ...(mine.tags.resource ? [{ label: 'Ressurs', value: mine.tags.resource }] : []),
                        ...(mine.tags.mineral ? [{ label: 'Mineral', value: mine.tags.mineral }] : []),
                        ...(mine.tags.start_date || mine.tags.end_date
                            ? [{ label: 'Periode', value: `${mine.tags.start_date ?? '?'} – ${mine.tags.end_date ?? 'nå'}` }]
                            : []),
                        ...(mine.tags.note
                            ? [{ label: 'Notat', value: mine.tags.note }]
                            : mine.tags.description
                            ? [{ label: 'Beskrivelse', value: mine.tags.description }]
                            : []),
                        { label: 'Kilde', value: 'OpenStreetMap' },
                    ],
                    ...(wikiUrl ? { linkUrl: wikiUrl, linkLabel: 'Wikipedia' } : {}),
                };
            }
            const quarry = dataRef.current.quarryCentroids.find((x) => x.id === id);
            if (quarry) {
                const wikiTag = quarry.tags.wikipedia;
                const wikiParts = wikiTag ? wikiTag.split(':') : null;
                const wikiUrl = wikiParts && wikiParts.length >= 2
                    ? `https://${wikiParts[0]}.wikipedia.org/wiki/${wikiParts.slice(1).join(':')}`
                    : undefined;
                return {
                    title: quarry.name || 'Steinbrudd',
                    icon: '⛏',
                    color: COLOR,
                    fields: [
                        { label: 'Type', value: 'Steinbrudd' },
                        ...(quarry.tags.operator ? [{ label: 'Operatør', value: quarry.tags.operator }] : []),
                        ...(quarry.tags.resource ? [{ label: 'Ressurs', value: quarry.tags.resource }] : []),
                        ...(quarry.tags.mineral ? [{ label: 'Mineral', value: quarry.tags.mineral }] : []),
                        ...(quarry.tags.start_date || quarry.tags.end_date
                            ? [{ label: 'Periode', value: `${quarry.tags.start_date ?? '?'} – ${quarry.tags.end_date ?? 'nå'}` }]
                            : []),
                        ...(quarry.tags.note
                            ? [{ label: 'Notat', value: quarry.tags.note }]
                            : quarry.tags.description
                            ? [{ label: 'Beskrivelse', value: quarry.tags.description }]
                            : []),
                        { label: 'Kilde', value: 'OpenStreetMap' },
                    ],
                    ...(wikiUrl ? { linkUrl: wikiUrl, linkLabel: 'Wikipedia' } : {}),
                };
            }
            return null;
        });
        return () => unregister('mines');
    }, [register, unregister]);

    useEffect(() => {
        tooltipRegister('mines', (entity: Entity) => {
            if (!dsRef.current?.entities.contains(entity)) return null;
            const id = entity.id as string;
            const mine = dataRef.current.mines.find((x) => x.id === id);
            if (mine) return { title: mine.name || 'Gruve', subtitle: mine.tags.resource, icon: '⛏', color: COLOR };
            const quarry = dataRef.current.quarryCentroids.find((x) => x.id === id);
            if (quarry) return { title: quarry.name || 'Steinbrudd', icon: '⛏', color: COLOR };
            return null;
        });
        return () => tooltipUnregister('mines');
    }, [tooltipRegister, tooltipUnregister]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('mines');
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
        setLayerLoading('mines', true);

        fetchMineData(viewport).then((data) => {
            if (cancelled || !dsRef.current) return;
            dataRef.current = data;
            const ds = dsRef.current;

            const existing = new Map<string, Entity>();
            for (const entity of ds.entities.values) existing.set(entity.id, entity);
            const seen = new Set<string>();

            for (const mine of data.mines) {
                try {
                    if (!isFinite(mine.lon) || !isFinite(mine.lat)) continue;
                    seen.add(mine.id);
                    if (!existing.has(mine.id)) {
                        ds.entities.add(new Entity({
                            id: mine.id,
                            name: mine.name || 'Gruve',
                            position: Cartesian3.fromDegrees(mine.lon, mine.lat, 0),
                            billboard: {
                                image: MINE_SVG,
                                width: new ConstantProperty(20),
                                height: new ConstantProperty(20),
                                heightReference: new ConstantProperty(HeightReference.CLAMP_TO_GROUND),
                                disableDepthTestDistance: new ConstantProperty(Number.POSITIVE_INFINITY),
                            },
                        }));
                    }
                } catch { /* skip */ }
            }

            for (const quarry of data.quarryCentroids) {
                try {
                    if (!isFinite(quarry.lon) || !isFinite(quarry.lat)) continue;
                    seen.add(quarry.id);
                    if (!existing.has(quarry.id)) {
                        ds.entities.add(new Entity({
                            id: quarry.id,
                            name: quarry.name || 'Steinbrudd',
                            position: Cartesian3.fromDegrees(quarry.lon, quarry.lat, 0),
                            billboard: {
                                image: QUARRY_SVG,
                                width: new ConstantProperty(20),
                                height: new ConstantProperty(20),
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

            const total = data.mines.length + data.quarryCentroids.length;
            setLayerCount('mines', total);
            setLayerLoading('mines', false);
            if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
        }).catch(() => setLayerLoading('mines', false));

        return () => { cancelled = true; };
    }, [visible, viewport, viewer, setLayerLoading, setLayerCount]);

    return null;
}
