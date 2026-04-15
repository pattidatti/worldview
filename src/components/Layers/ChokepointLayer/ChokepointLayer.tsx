import { useEffect, useRef } from 'react';
import {
    CustomDataSource,
    Entity,
    Cartesian3,
    Color,
    PolygonHierarchy,
    ConstantProperty,
    LabelStyle,
    VerticalOrigin,
    HorizontalOrigin,
    Cartesian2,
    NearFarScalar,
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { CHOKEPOINTS } from '@/services/chokepoints';

const FILL_COLOR = Color.fromCssColorString('#ff6b35').withAlpha(0.08);
const OUTLINE_COLOR = Color.fromCssColorString('#ff6b35').withAlpha(0.85);
const LABEL_SCALE = new NearFarScalar(500_000, 1.2, 8_000_000, 0.6);

function centroid(coords: [number, number][]): { lon: number; lat: number } {
    const lon = coords.reduce((s, c) => s + c[0], 0) / coords.length;
    const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
    return { lon, lat };
}

export function ChokepointLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerCount } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const visible = isVisible('chokepoints');
    const dataSourceRef = useRef<CustomDataSource | null>(null);

    // Register popup builder
    useEffect(() => {
        register('chokepoints', (entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const cp = CHOKEPOINTS.find((c) => c.id === entity.id || c.id === entity.id.replace('-label', ''));
            if (!cp) return null;
            const fields: { label: string; value: string | number; unit?: string }[] = [
                { label: 'Daglig trafikk', value: cp.dailyShips, unit: ' skip/dag' },
                { label: 'Bredde', value: cp.width_km < 1 ? `${cp.width_km * 1000}` : cp.width_km, unit: cp.width_km < 1 ? ' m' : ' km' },
            ];
            if (cp.oilPercent) fields.push({ label: 'Global oljefart', value: cp.oilPercent, unit: '%' });
            return {
                title: cp.name,
                icon: '🌊',
                color: '#ff6b35',
                fields,
                description: cp.description,
            };
        });
        return () => unregister('chokepoints');
    }, [register, unregister]);

    // Register tooltip builder
    useEffect(() => {
        tooltipRegister('chokepoints', (entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const cp = CHOKEPOINTS.find((c) => c.id === entity.id || c.id === entity.id.replace('-label', ''));
            if (!cp) return null;
            return {
                title: cp.name,
                subtitle: `${cp.dailyShips} skip/dag · ${cp.width_km} km bred`,
                icon: '🌊',
                color: '#ff6b35',
            };
        });
        return () => tooltipUnregister('chokepoints');
    }, [tooltipRegister, tooltipUnregister]);

    // Create data source og entities (static data)
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('chokepoints');
        viewer.dataSources.add(ds);
        dataSourceRef.current = ds;

        for (const cp of CHOKEPOINTS) {
            const positions = cp.coordinates.map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat));
            const { lon, lat } = centroid(cp.coordinates);

            // Polygon (fyllt areal)
            ds.entities.add(new Entity({
                id: cp.id,
                name: cp.name,
                polygon: {
                    hierarchy: new ConstantProperty(new PolygonHierarchy(positions)),
                    material: FILL_COLOR,
                    outline: true,
                    outlineColor: OUTLINE_COLOR,
                    outlineWidth: 2,
                    heightReference: 0, // NONE
                },
            }));

            // Label på sentrum
            ds.entities.add(new Entity({
                id: `${cp.id}-label`,
                name: cp.name,
                position: Cartesian3.fromDegrees(lon, lat, 0),
                label: {
                    text: cp.shortName.toUpperCase(),
                    font: '12px "JetBrains Mono", monospace',
                    fillColor: Color.fromCssColorString('#ff6b35'),
                    outlineColor: Color.BLACK.withAlpha(0.8),
                    outlineWidth: 3,
                    style: LabelStyle.FILL_AND_OUTLINE,
                    verticalOrigin: VerticalOrigin.CENTER,
                    horizontalOrigin: HorizontalOrigin.CENTER,
                    pixelOffset: new Cartesian2(0, 0),
                    scaleByDistance: LABEL_SCALE,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                },
            }));
        }

        setLayerCount('chokepoints', CHOKEPOINTS.length);
        viewer.scene.requestRender();

        return () => {
            if (!viewer.isDestroyed()) viewer.dataSources.remove(ds, true);
            dataSourceRef.current = null;
        };
    }, [viewer, setLayerCount]);

    useEffect(() => {
        if (dataSourceRef.current) dataSourceRef.current.show = visible;
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [visible, viewer]);

    return null;
}
