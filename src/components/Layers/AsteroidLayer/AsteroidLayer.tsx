import { useEffect, useRef, useCallback } from 'react';
import {
    CustomDataSource,
    Entity,
    Cartesian3,
    Color,
    ConstantPositionProperty,
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { usePollingData } from '@/hooks/usePollingData';
import { syncEntities } from '@/utils/syncEntities';
import { fetchAsteroids } from '@/services/nasa-neo';
import { type Asteroid } from '@/types/asteroid';

// Refresh once per day — data changes slowly
const POLL_MS = 24 * 60 * 60 * 1000;

// Distribute asteroids in a ring above the globe
// altitude ~ proportional to miss distance (logarithmic scale), capped
const MIN_ALT = 30_000_000;   // 30,000 km
const MAX_ALT = 400_000_000;  // 400,000 km (~1 lunar distance)

function asteroidAltitude(missKm: number): number {
    const clamped = Math.max(1, Math.min(missKm, 400_000));
    return MIN_ALT + (clamped / 400_000) * (MAX_ALT - MIN_ALT);
}

function asteroidColor(isHazardous: boolean): Color {
    return isHazardous
        ? Color.fromCssColorString('#ff2244').withAlpha(0.9)
        : Color.fromCssColorString('#aaaaaa').withAlpha(0.75);
}

function pixelSize(diameterM: number): number {
    const avg = diameterM;
    if (avg > 500) return 14;
    if (avg > 100) return 10;
    if (avg > 50)  return 8;
    return 6;
}

function formatDiameter(minM: number, maxM: number): string {
    const avg = (minM + maxM) / 2;
    if (avg >= 1000) return `~${(avg / 1000).toFixed(1)} km`;
    return `~${Math.round(avg)} m`;
}

function formatDistance(km: number): string {
    if (km >= 1_000_000) return `${(km / 1_000_000).toFixed(2)} millioner km`;
    return `${Math.round(km).toLocaleString('nb-NO')} km`;
}

function formatVelocity(kmh: number): string {
    return `${Math.round(kmh).toLocaleString('nb-NO')} km/t`;
}

export function AsteroidLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const visible = isVisible('asteroids');
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const asteroidsRef = useRef<Asteroid[]>([]);

    const { data: asteroids, loading, error, lastUpdated } = usePollingData(fetchAsteroids, POLL_MS, visible);
    if (asteroids) asteroidsRef.current = asteroids;

    useEffect(() => { setLayerError('asteroids', error); }, [error, setLayerError]);
    useEffect(() => { setLayerLastUpdated('asteroids', lastUpdated); }, [lastUpdated, setLayerLastUpdated]);
    useEffect(() => { setLayerLoading('asteroids', loading); }, [loading, setLayerLoading]);

    useEffect(() => {
        register('asteroids', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const a = asteroidsRef.current.find((x) => `asteroid-${x.id}` === entity.id);
            if (!a) return null;
            return {
                title: a.name,
                icon: '☄',
                color: a.isHazardous ? '#ff2244' : '#aaaaaa',
                linkUrl: a.nasaUrl,
                fields: [
                    { label: 'Farlig', value: a.isHazardous ? '⚠ Potensielt farlig' : 'Trygg' },
                    { label: 'Diameter', value: formatDiameter(a.diameterMinM, a.diameterMaxM) },
                    { label: 'Nærmeste passasje', value: a.closeApproachDate },
                    { label: 'Avstand', value: formatDistance(a.missDistanceKm) },
                    { label: 'Hastighet', value: formatVelocity(a.relativeVelocityKmh) },
                ],
            };
        });
        return () => unregister('asteroids');
    }, [register, unregister]);

    useEffect(() => {
        tooltipRegister('asteroids', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const a = asteroidsRef.current.find((x) => `asteroid-${x.id}` === entity.id);
            if (!a) return null;
            return {
                title: a.name,
                subtitle: formatDistance(a.missDistanceKm),
                icon: '☄',
                color: a.isHazardous ? '#ff2244' : '#aaaaaa',
            };
        });
        return () => tooltipUnregister('asteroids');
    }, [tooltipRegister, tooltipUnregister]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('asteroids');
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

    const updateEntities = useCallback(() => {
        const ds = dataSourceRef.current;
        if (!ds || !asteroids) return;
        setLayerCount('asteroids', asteroids.length);
        // Distribuerer rundt ekvatorial-ring — indeks avgjør longitude
        const total = asteroids.length;
        const indexed = asteroids.map((a, i) => ({ a, i }));
        syncEntities({
            ds,
            items: indexed,
            getId: ({ a }) => `asteroid-${a.id}`,
            onUpdate: (entity, { a, i }) => {
                const lon = (i / total) * 360 - 180;
                (entity.position as ConstantPositionProperty).setValue(
                    Cartesian3.fromDegrees(lon, 0, asteroidAltitude(a.missDistanceKm))
                );
            },
            onCreate: ({ a, i }) => {
                const lon = (i / total) * 360 - 180;
                const pos = Cartesian3.fromDegrees(lon, 0, asteroidAltitude(a.missDistanceKm));
                const color = asteroidColor(a.isHazardous);
                const size = pixelSize((a.diameterMinM + a.diameterMaxM) / 2);
                return new Entity({
                    id: `asteroid-${a.id}`,
                    name: a.name,
                    position: pos,
                    point: { pixelSize: size, color, outlineColor: color.withAlpha(1.0), outlineWidth: 1 },
                });
            },
            viewer,
        });
    }, [asteroids, viewer, setLayerCount]);

    useEffect(() => { updateEntities(); }, [updateEntities]);

    return null;
}
