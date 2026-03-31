import { useEffect, useRef, useCallback } from 'react';
import {
    CustomDataSource,
    Entity,
    Cartesian3,
    Color,
    ConstantPositionProperty,
    EllipseGraphics,
    ConstantProperty,
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { usePollingData } from '@/hooks/usePollingData';
import { syncEntities } from '@/utils/syncEntities';
import { fetchEarthquakes } from '@/services/usgs';
import { type Earthquake } from '@/types/earthquake';
import { fetchWikiSummary } from '@/services/wikipedia';

const POLL_MS = 5 * 60 * 1000; // 5 minutes

// Color by depth: shallow=red, medium=orange, deep=blue
function depthColor(depth: number): Color {
    if (depth < 30) return Color.fromCssColorString('#ff3333').withAlpha(0.75);
    if (depth < 100) return Color.fromCssColorString('#ff8800').withAlpha(0.75);
    return Color.fromCssColorString('#3399ff').withAlpha(0.75);
}

// Radius in meters — grows with magnitude (M2.5=25km ... M8=800km)
function magnitudeRadius(mag: number): number {
    return Math.max(20_000, Math.pow(10, mag * 0.6) * 800);
}

// Extract city/region name from USGS place string, e.g. "10km NE of San Francisco, CA" → "San Francisco, CA"
function extractPlace(place: string): string {
    const ofIdx = place.lastIndexOf(' of ');
    return ofIdx >= 0 ? place.slice(ofIdx + 4) : place;
}

function formatTime(ms: number): string {
    return new Date(ms).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' });
}

export function EarthquakeLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const visible = isVisible('earthquakes');
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const quakesRef = useRef<Earthquake[]>([]);

    const { data: quakes, loading, error, lastUpdated } = usePollingData(fetchEarthquakes, POLL_MS, visible);
    if (quakes) quakesRef.current = quakes;

    useEffect(() => { setLayerError('earthquakes', error); }, [error, setLayerError]);
    useEffect(() => { setLayerLastUpdated('earthquakes', lastUpdated); }, [lastUpdated, setLayerLastUpdated]);

    useEffect(() => {
        if (loading) setLayerLoading('earthquakes', true);
        else setLayerLoading('earthquakes', false);
    }, [loading, setLayerLoading]);

    useEffect(() => {
        register('earthquakes', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const quake = quakesRef.current.find((q) => `eq-${q.id}` === entity.id);
            if (!quake) return null;
            const searchPlace = extractPlace(quake.place);
            return {
                title: quake.title,
                icon: '🌍',
                color: '#ff3333',
                linkUrl: quake.url,
                fields: [
                    { label: 'Magnitude', value: quake.magnitude.toFixed(1) },
                    { label: 'Sted', value: quake.place },
                    { label: 'Dybde', value: quake.depth.toFixed(1), unit: 'km' },
                    { label: 'Tid', value: formatTime(quake.time) },
                ],
                enrichAsync: async () => {
                    const wiki = await fetchWikiSummary(searchPlace);
                    if (!wiki?.extract) return {};
                    return {
                        description: wiki.extract.length > 300 ? wiki.extract.slice(0, 297) + '...' : wiki.extract,
                        ...(wiki.thumbnailUrl ? { imageUrl: wiki.thumbnailUrl } : {}),
                    };
                },
            };
        });
        return () => unregister('earthquakes');
    }, [register, unregister]);

    useEffect(() => {
        tooltipRegister('earthquakes', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const quake = quakesRef.current.find((q) => `eq-${q.id}` === entity.id);
            if (!quake) return null;
            return {
                title: `M${quake.magnitude.toFixed(1)} — ${quake.place}`,
                subtitle: `Dybde ${quake.depth.toFixed(0)} km`,
                icon: '🌍',
                color: '#ff3333',
            };
        });
        return () => tooltipUnregister('earthquakes');
    }, [tooltipRegister, tooltipUnregister]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('earthquakes');
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
        if (!ds || !quakes) return;
        setLayerCount('earthquakes', quakes.length);
        syncEntities({
            ds,
            items: quakes,
            getId: (q) => `eq-${q.id}`,
            onUpdate: (entity, q) => {
                const pos = Cartesian3.fromDegrees(q.lon, q.lat);
                const color = depthColor(q.depth);
                const radius = magnitudeRadius(q.magnitude);
                (entity.position as ConstantPositionProperty).setValue(pos);
                if (entity.ellipse) {
                    (entity.ellipse.semiMajorAxis as ConstantProperty).setValue(radius);
                    (entity.ellipse.semiMinorAxis as ConstantProperty).setValue(radius);
                    (entity.ellipse.material as unknown as ConstantProperty).setValue(color);
                    (entity.ellipse.outlineColor as unknown as ConstantProperty).setValue(color.withAlpha(1.0));
                }
            },
            onCreate: (q) => {
                const pos = Cartesian3.fromDegrees(q.lon, q.lat);
                const color = depthColor(q.depth);
                const radius = magnitudeRadius(q.magnitude);
                return new Entity({
                    id: `eq-${q.id}`,
                    name: q.title,
                    position: pos,
                    ellipse: new EllipseGraphics({
                        semiMajorAxis: radius,
                        semiMinorAxis: radius,
                        material: color,
                        outline: true,
                        outlineColor: color.withAlpha(1.0),
                        outlineWidth: 2,
                        heightReference: 1, // CLAMP_TO_GROUND
                    }),
                });
            },
            viewer,
        });
    }, [quakes, viewer, setLayerCount]);

    useEffect(() => { updateEntities(); }, [updateEntities]);

    return null;
}
