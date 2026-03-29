import { useEffect, useRef, useCallback, useState } from 'react';
import {
    CustomDataSource,
    Entity,
    Cartesian3,
    Color,
    PointGraphics,
    ConstantPositionProperty,
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useViewport } from '@/hooks/useViewport';
import { AISStreamConnection } from '@/services/aisstream';
import { type Ship } from '@/types/ship';

const SHIP_COLOR = Color.fromCssColorString('#00d4ff');
const API_KEY = import.meta.env.VITE_AISSTREAM_API_KEY || '';
const MAX_SHIPS = 1000;

export function ShipLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const visible = isVisible('ships');
    const viewport = useViewport(viewer);
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const [ships, setShips] = useState<Map<number, Ship>>(new Map());
    const shipsRef = useRef<Map<number, Ship>>(new Map());
    shipsRef.current = ships;

    // Register popup builder
    useEffect(() => {
        register('ships', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const ship = shipsRef.current.get(Number(entity.id));
            if (!ship) return null;
            return {
                title: ship.name || `MMSI ${ship.mmsi}`,
                icon: '⚓',
                color: '#00d4ff',
                fields: [
                    { label: 'MMSI', value: ship.mmsi },
                    { label: 'Hastighet', value: ship.speed.toFixed(1), unit: 'kn' },
                    { label: 'Kurs', value: `${Math.round(ship.course)}°` },
                    ...(ship.destination ? [{ label: 'Destinasjon', value: ship.destination }] : []),
                    { label: 'Breddegrad', value: ship.lat.toFixed(4), unit: '°' },
                    { label: 'Lengdegrad', value: ship.lon.toFixed(4), unit: '°' },
                ],
            };
        });
        return () => unregister('ships');
    }, [register, unregister]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('ships');
        viewer.dataSources.add(ds);
        dataSourceRef.current = ds;
        return () => {
            if (!viewer.isDestroyed()) viewer.dataSources.remove(ds, true);
            dataSourceRef.current = null;
        };
    }, [viewer]);

    useEffect(() => {
        if (dataSourceRef.current) dataSourceRef.current.show = visible;
    }, [visible]);

    useEffect(() => {
        if (!visible || !API_KEY || !viewport) {
            console.log('[ShipLayer] skipping:', { visible, hasKey: !!API_KEY, hasViewport: !!viewport });
            return;
        }
        console.log('[ShipLayer] connecting WebSocket with viewport:', viewport);
        setLayerLoading('ships', true);
        const conn = new AISStreamConnection(API_KEY, viewport, (updatedShips) => {
            console.log('[ShipLayer] received', updatedShips.size, 'ships');
            // Cap at MAX_SHIPS
            if (updatedShips.size > MAX_SHIPS) {
                const entries = [...updatedShips.entries()];
                setShips(new Map(entries.slice(-MAX_SHIPS)));
            } else {
                setShips(updatedShips);
            }
            setLayerLoading('ships', false);
        });
        conn.connect();
        return () => conn.disconnect();
    }, [visible, viewport, setLayerLoading]);

    const updateEntities = useCallback(() => {
        const ds = dataSourceRef.current;
        if (!ds) return;
        setLayerCount('ships', ships.size);
        const existing = new Map<string, Entity>();
        for (const entity of ds.entities.values) existing.set(entity.id, entity);
        const seen = new Set<string>();
        for (const [mmsi, ship] of ships) {
            const id = String(mmsi);
            seen.add(id);
            const pos = Cartesian3.fromDegrees(ship.lon, ship.lat, 0);
            const entity = existing.get(id);
            if (entity) {
                (entity.position as ConstantPositionProperty).setValue(pos);
            } else {
                ds.entities.add(new Entity({
                    id, name: ship.name || `MMSI ${mmsi}`, position: pos,
                    point: new PointGraphics({
                        pixelSize: 5, color: SHIP_COLOR,
                        outlineColor: Color.fromCssColorString('#00d4ff66'), outlineWidth: 1,
                    }),
                }));
            }
        }
        for (const [id] of existing) { if (!seen.has(id)) ds.entities.removeById(id); }
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [ships, viewer, setLayerCount]);

    useEffect(() => { updateEntities(); }, [updateEntities]);

    if (!API_KEY) return null;
    return null;
}
