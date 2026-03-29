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
import { useViewport } from '@/hooks/useViewport';
import { AISStreamConnection } from '@/services/aisstream';
import { type Ship } from '@/types/ship';
import { type PopupContent } from '@/types/popup';

const SHIP_COLOR = Color.fromCssColorString('#00d4ff');
const API_KEY = import.meta.env.VITE_AISSTREAM_API_KEY || '';

interface ShipLayerProps {
    onSelect: (popup: PopupContent | null) => void;
}

export function ShipLayer({ onSelect }: ShipLayerProps) {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount } = useLayers();
    const visible = isVisible('ships');
    const viewport = useViewport(viewer);
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const connectionRef = useRef<AISStreamConnection | null>(null);
    const [ships, setShips] = useState<Map<number, Ship>>(new Map());

    // Create/remove data source
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;

        const ds = new CustomDataSource('ships');
        viewer.dataSources.add(ds);
        dataSourceRef.current = ds;

        return () => {
            if (!viewer.isDestroyed()) {
                viewer.dataSources.remove(ds, true);
            }
            dataSourceRef.current = null;
        };
    }, [viewer]);

    // Toggle visibility
    useEffect(() => {
        if (dataSourceRef.current) {
            dataSourceRef.current.show = visible;
        }
    }, [visible]);

    // WebSocket connection
    useEffect(() => {
        if (!visible || !API_KEY || !viewport) return;

        setLayerLoading('ships', true);

        const conn = new AISStreamConnection(API_KEY, viewport, (updatedShips) => {
            setShips(updatedShips);
            setLayerLoading('ships', false);
        });

        conn.connect();
        connectionRef.current = conn;

        return () => {
            conn.disconnect();
            connectionRef.current = null;
        };
        // Only reconnect when visibility changes, not on every viewport change
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, setLayerLoading]);

    // Update entities when ships change
    const updateEntities = useCallback(() => {
        const ds = dataSourceRef.current;
        if (!ds) return;

        setLayerCount('ships', ships.size);

        const existing = new Map<string, Entity>();
        for (const entity of ds.entities.values) {
            existing.set(entity.id, entity);
        }

        const seen = new Set<string>();
        for (const [mmsi, ship] of ships) {
            const id = String(mmsi);
            seen.add(id);
            const pos = Cartesian3.fromDegrees(ship.lon, ship.lat, 0);
            const entity = existing.get(id);

            if (entity) {
                (entity.position as ConstantPositionProperty).setValue(pos);
            } else {
                const e = new Entity({
                    id,
                    name: ship.name || `MMSI ${mmsi}`,
                    position: pos,
                    point: new PointGraphics({
                        pixelSize: 5,
                        color: SHIP_COLOR,
                        outlineColor: Color.fromCssColorString('#00d4ff66'),
                        outlineWidth: 1,
                    }),
                });
                ds.entities.add(e);
            }
        }

        for (const [id] of existing) {
            if (!seen.has(id)) ds.entities.removeById(id);
        }
    }, [ships, setLayerCount]);

    useEffect(() => {
        updateEntities();
    }, [updateEntities]);

    // Handle clicks
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;

        const handler = viewer.selectedEntityChanged.addEventListener((entity: Entity | undefined) => {
            if (!entity || !dataSourceRef.current?.entities.contains(entity)) {
                return;
            }

            const ship = ships.get(Number(entity.id));
            if (!ship) return;

            onSelect({
                title: ship.name || `MMSI ${ship.mmsi}`,
                icon: '⚓',
                color: '#00d4ff',
                fields: [
                    { label: 'MMSI', value: ship.mmsi },
                    { label: 'Hastighet', value: ship.speed.toFixed(1), unit: 'kn' },
                    { label: 'Kurs', value: `${Math.round(ship.course)}°` },
                    ...(ship.destination
                        ? [{ label: 'Destinasjon', value: ship.destination }]
                        : []),
                    { label: 'Breddegrad', value: ship.lat.toFixed(4), unit: '°' },
                    { label: 'Lengdegrad', value: ship.lon.toFixed(4), unit: '°' },
                ],
            });
        });

        return () => {
            handler();
        };
    }, [viewer, ships, onSelect]);

    if (!API_KEY) return null;

    return null;
}
