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
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { usePollingData } from '@/hooks/usePollingData';
import { fetchWeather, weatherSymbolToEmoji } from '@/services/metno';
import { type WeatherPoint } from '@/types/weather';

const WEATHER_COLOR = Color.fromCssColorString('#b0d4ff');
const POLL_MS = 10 * 60 * 1000;

export function WeatherLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const visible = isVisible('weather');
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const weatherRef = useRef<WeatherPoint[]>([]);

    const { data: weather, loading, error, lastUpdated } = usePollingData(fetchWeather, POLL_MS, visible);
    if (weather) weatherRef.current = weather;

    useEffect(() => { setLayerError('weather', error); }, [error, setLayerError]);
    useEffect(() => { setLayerLastUpdated('weather', lastUpdated); }, [lastUpdated, setLayerLastUpdated]);

    // Register popup builder
    useEffect(() => {
        register('weather', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const wp = weatherRef.current.find((w) => `weather-${w.name}` === entity.id);
            if (!wp) return null;
            return {
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
            };
        });
        return () => unregister('weather');
    }, [register, unregister]);

    // Register tooltip builder
    useEffect(() => {
        tooltipRegister('weather', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const wp = weatherRef.current.find((w) => `weather-${w.name}` === entity.id);
            if (!wp) return null;
            return {
                title: wp.name,
                subtitle: `${wp.temperature.toFixed(1)}°C · ${wp.windSpeed.toFixed(1)} m/s`,
                icon: weatherSymbolToEmoji(wp.symbol),
                color: '#b0d4ff',
            };
        });
        return () => tooltipUnregister('weather');
    }, [tooltipRegister, tooltipUnregister]);

    useEffect(() => { setLayerLoading('weather', loading); }, [loading, setLayerLoading]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('weather');
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
        if (!ds || !weather) return;
        setLayerCount('weather', weather.length);
        const existing = new Map<string, Entity>();
        for (const entity of ds.entities.values) existing.set(entity.id, entity);
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
                if (entity.label) entity.label.text = labelText as unknown as import('cesium').Property;
            } else {
                ds.entities.add(new Entity({
                    id, name: wp.name, position: pos,
                    label: new LabelGraphics({
                        text: labelText, font: '14px Inter, sans-serif',
                        fillColor: WEATHER_COLOR, outlineColor: Color.BLACK, outlineWidth: 2,
                        style: LabelStyle.FILL_AND_OUTLINE, verticalOrigin: VerticalOrigin.CENTER,
                        pixelOffset: new Cartesian2(0, 0),
                        disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    }),
                }));
            }
        }
        for (const [id] of existing) { if (!seen.has(id)) ds.entities.removeById(id); }
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [weather, viewer, setLayerCount]);

    useEffect(() => { updateEntities(); }, [updateEntities]);

    return null;
}
