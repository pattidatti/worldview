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
import { usePollingData } from '@/hooks/usePollingData';
import { fetchTLEData } from '@/services/celestrak';
import { computePositions } from '@/utils/satellite';
import { type SatelliteRecord } from '@/types/satellite';

const SAT_COLOR = Color.fromCssColorString('#00ff88');
const TLE_REFRESH_MS = 30 * 60 * 1000;
const POSITION_REFRESH_MS = 10_000;

export function SatelliteLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const visible = isVisible('satellites');
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const [tleData, setTleData] = useState<SatelliteRecord[]>([]);
    const tleRef = useRef<SatelliteRecord[]>([]);
    tleRef.current = tleData;

    // Register popup builder
    useEffect(() => {
        register('satellites', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const positions = computePositions(
                tleRef.current.filter((t) => t.tle1.substring(2, 7).trim() === entity.id)
            );
            const sat = positions[0];
            if (!sat) return null;
            return {
                title: sat.name,
                icon: '🛰',
                color: '#00ff88',
                fields: [
                    { label: 'NORAD ID', value: sat.noradId },
                    { label: 'Breddegrad', value: sat.lat.toFixed(2), unit: '°' },
                    { label: 'Lengdegrad', value: sat.lon.toFixed(2), unit: '°' },
                    { label: 'Høyde', value: sat.alt.toFixed(0), unit: 'km' },
                    { label: 'Hastighet', value: sat.velocity.toFixed(1), unit: 'km/s' },
                ],
            };
        });
        return () => unregister('satellites');
    }, [register, unregister]);

    const { data: freshTle, loading, error, lastUpdated } = usePollingData(
        () => fetchTLEData('stations'),
        TLE_REFRESH_MS,
        visible
    );

    useEffect(() => { setLayerLoading('satellites', loading); }, [loading, setLayerLoading]);
    useEffect(() => { setLayerError('satellites', error); }, [error, setLayerError]);
    useEffect(() => { setLayerLastUpdated('satellites', lastUpdated); }, [lastUpdated, setLayerLastUpdated]);

    useEffect(() => {
        if (freshTle) setTleData(freshTle);
    }, [freshTle]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('satellites');
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

    const updatePositions = useCallback(() => {
        const ds = dataSourceRef.current;
        if (!ds || !tleData.length) return;
        const positions = computePositions(tleData);
        setLayerCount('satellites', positions.length);
        const existing = new Map<string, Entity>();
        for (const entity of ds.entities.values) existing.set(entity.id, entity);
        const seen = new Set<string>();
        for (const sat of positions) {
            seen.add(sat.noradId);
            const pos = Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt * 1000);
            const entity = existing.get(sat.noradId);
            if (entity) {
                (entity.position as ConstantPositionProperty).setValue(pos);
            } else {
                ds.entities.add(new Entity({
                    id: sat.noradId, name: sat.name, position: pos,
                    point: new PointGraphics({
                        pixelSize: 4, color: SAT_COLOR,
                        outlineColor: Color.fromCssColorString('#00ff8866'), outlineWidth: 1,
                    }),
                }));
            }
        }
        for (const [id] of existing) {
            if (!seen.has(id)) ds.entities.removeById(id);
        }
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [tleData, viewer, setLayerCount]);

    useEffect(() => {
        if (!visible || !tleData.length) return;
        updatePositions();
        const id = setInterval(updatePositions, POSITION_REFRESH_MS);
        return () => clearInterval(id);
    }, [visible, tleData, updatePositions]);

    return null;
}
