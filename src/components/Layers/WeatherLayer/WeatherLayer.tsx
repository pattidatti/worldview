import { useEffect, useRef, useCallback } from 'react';
import {
    CustomDataSource,
    Entity,
    Cartesian3,
    Color,
    ConstantPositionProperty,
    LabelGraphics,
    LabelStyle,
    VerticalOrigin,
    Cartesian2,
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';
import { usePollingData } from '@/hooks/usePollingData';
import { fetchWeather, weatherSymbolToEmoji } from '@/services/metno';
import { type PopupContent } from '@/types/popup';

const WEATHER_COLOR = Color.fromCssColorString('#b0d4ff');
const POLL_MS = 10 * 60 * 1000; // 10 min (MET wants max 1 req/20s per endpoint)

interface WeatherLayerProps {
    onSelect: (popup: PopupContent | null) => void;
}

export function WeatherLayer({ onSelect }: WeatherLayerProps) {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount } = useLayers();
    const visible = isVisible('weather');
    const dataSourceRef = useRef<CustomDataSource | null>(null);

    const { data: weather, loading } = usePollingData(fetchWeather, POLL_MS, visible);

    useEffect(() => {
        setLayerLoading('weather', loading);
    }, [loading, setLayerLoading]);

    // Create/remove data source
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;

        const ds = new CustomDataSource('weather');
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

    // Update entities
    const updateEntities = useCallback(() => {
        const ds = dataSourceRef.current;
        if (!ds || !weather) return;

        setLayerCount('weather', weather.length);

        const existing = new Map<string, Entity>();
        for (const entity of ds.entities.values) {
            existing.set(entity.id, entity);
        }

        const seen = new Set<string>();
        for (const wp of weather) {
            const id = `weather-${wp.name}`;
            seen.add(id);
            const pos = Cartesian3.fromDegrees(wp.lon, wp.lat, 0);
            const emoji = weatherSymbolToEmoji(wp.symbol);
            const labelText = `${emoji} ${Math.round(wp.temperature)}°`;
            const entity = existing.get(id);

            if (entity) {
                (entity.position as ConstantPositionProperty).setValue(pos);
                if (entity.label) {
                    entity.label.text = labelText as unknown as import('cesium').Property;
                }
            } else {
                const e = new Entity({
                    id,
                    name: wp.name,
                    position: pos,
                    label: new LabelGraphics({
                        text: labelText,
                        font: '14px Inter, sans-serif',
                        fillColor: WEATHER_COLOR,
                        outlineColor: Color.BLACK,
                        outlineWidth: 2,
                        style: LabelStyle.FILL_AND_OUTLINE,
                        verticalOrigin: VerticalOrigin.CENTER,
                        pixelOffset: new Cartesian2(0, 0),
                        disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    }),
                });
                ds.entities.add(e);
            }
        }

        for (const [id] of existing) {
            if (!seen.has(id)) ds.entities.removeById(id);
        }
    }, [weather, setLayerCount]);

    useEffect(() => {
        updateEntities();
    }, [updateEntities]);

    // Handle clicks
    useEffect(() => {
        if (!viewer || viewer.isDestroyed() || !weather) return;

        const handler = viewer.selectedEntityChanged.addEventListener((entity: Entity | undefined) => {
            if (!entity || !dataSourceRef.current?.entities.contains(entity)) {
                return;
            }

            const wp = weather.find((w) => `weather-${w.name}` === entity.id);
            if (!wp) return;

            onSelect({
                title: wp.name,
                icon: weatherSymbolToEmoji(wp.symbol),
                color: '#b0d4ff',
                fields: [
                    { label: 'Temperatur', value: `${wp.temperature.toFixed(1)}`, unit: '°C' },
                    { label: 'Vind', value: wp.windSpeed.toFixed(1), unit: 'm/s' },
                    { label: 'Vindretning', value: `${Math.round(wp.windDirection)}°` },
                    { label: 'Luftfuktighet', value: Math.round(wp.humidity), unit: '%' },
                    { label: 'Nedbør (1t)', value: wp.precipitation.toFixed(1), unit: 'mm' },
                ],
            });
        });

        return () => {
            handler();
        };
    }, [viewer, weather, onSelect]);

    return null;
}
