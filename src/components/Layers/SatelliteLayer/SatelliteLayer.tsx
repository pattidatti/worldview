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
import { usePollingData } from '@/hooks/usePollingData';
import { fetchTLEData } from '@/services/celestrak';
import { computePositions } from '@/utils/satellite';
import { type SatelliteRecord } from '@/types/satellite';
import { type PopupContent } from '@/types/popup';

const SAT_COLOR = Color.fromCssColorString('#00ff88');
const TLE_REFRESH_MS = 30 * 60 * 1000; // 30 min
const POSITION_REFRESH_MS = 10_000; // 10s

interface SatelliteLayerProps {
    onSelect: (popup: PopupContent | null) => void;
}

export function SatelliteLayer({ onSelect }: SatelliteLayerProps) {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount } = useLayers();
    const visible = isVisible('satellites');
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const [tleData, setTleData] = useState<SatelliteRecord[]>([]);

    // Fetch TLE data periodically
    const { data: freshTle, loading } = usePollingData(
        () => fetchTLEData('stations'),
        TLE_REFRESH_MS,
        visible
    );

    useEffect(() => {
        setLayerLoading('satellites', loading);
    }, [loading, setLayerLoading]);

    useEffect(() => {
        if (freshTle) setTleData(freshTle);
    }, [freshTle]);

    // Create/remove data source
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;

        const ds = new CustomDataSource('satellites');
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

    // Update positions periodically
    const updatePositions = useCallback(() => {
        const ds = dataSourceRef.current;
        if (!ds || !tleData.length) return;

        const positions = computePositions(tleData);
        setLayerCount('satellites', positions.length);

        const existing = new Map<string, Entity>();
        for (const entity of ds.entities.values) {
            existing.set(entity.id, entity);
        }

        const seen = new Set<string>();
        for (const sat of positions) {
            seen.add(sat.noradId);
            const pos = Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt * 1000);
            const entity = existing.get(sat.noradId);

            if (entity) {
                (entity.position as ConstantPositionProperty).setValue(pos);
                entity.properties?.addProperty('_satData', sat);
            } else {
                const e = new Entity({
                    id: sat.noradId,
                    name: sat.name,
                    position: pos,
                    point: new PointGraphics({
                        pixelSize: 4,
                        color: SAT_COLOR,
                        outlineColor: Color.fromCssColorString('#00ff8866'),
                        outlineWidth: 1,
                    }),
                });
                ds.entities.add(e);
            }
        }

        // Remove satellites no longer in data
        for (const [id] of existing) {
            if (!seen.has(id)) ds.entities.removeById(id);
        }
    }, [tleData, setLayerCount]);

    useEffect(() => {
        if (!visible || !tleData.length) return;
        updatePositions();
        const id = setInterval(updatePositions, POSITION_REFRESH_MS);
        return () => clearInterval(id);
    }, [visible, tleData, updatePositions]);

    // Handle clicks
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;

        const handler = viewer.selectedEntityChanged.addEventListener((entity: Entity | undefined) => {
            if (!entity || !dataSourceRef.current?.entities.contains(entity)) {
                return;
            }

            const positions = computePositions(
                tleData.filter((t) => t.tle1.substring(2, 7).trim() === entity.id)
            );
            const sat = positions[0];
            if (!sat) return;

            onSelect({
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
            });
        });

        return () => {
            handler();
        };
    }, [viewer, tleData, onSelect]);

    return null;
}
