import { useEffect, useRef } from 'react';
import {
    CustomDataSource,
    Entity,
    Cartesian3,
    Color,
    LabelGraphics,
    LabelStyle,
    VerticalOrigin,
    HorizontalOrigin,
    DistanceDisplayCondition,
    Cartesian2,
    PointGraphics,
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { PLACES, type Place } from '@/services/places';

const LABEL_COLOR = Color.fromCssColorString('#c8d2e1');
const LABEL_COLOR_DIM = Color.fromCssColorString('#8899aa');
const OUTLINE_COLOR = Color.fromCssColorString('#000000');
const POINT_COLOR = Color.fromCssColorString('#8899aa60');

function maxDistance(place: Place): number {
    if (place.type === 'capital') return 20_000_000;
    if (place.type === 'city') return 5_000_000;
    return 1_500_000;
}

function fontSize(place: Place): string {
    if (place.type === 'capital') return 'bold 13px Inter, sans-serif';
    if (place.type === 'city') return '12px Inter, sans-serif';
    return '11px Inter, sans-serif';
}

function formatPopulation(pop: number): string {
    if (pop >= 1_000_000) return `${(pop / 1_000_000).toFixed(1)} mill.`;
    if (pop >= 1_000) return `${Math.round(pop / 1_000)} 000`;
    return pop.toLocaleString('nb-NO');
}

export function PlaceLabels() {
    const viewer = useViewer();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipReg, unregister: tooltipUnreg } = useTooltipRegistry();
    const dataSourceRef = useRef<CustomDataSource | null>(null);

    // Create data source and entities
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;

        const ds = new CustomDataSource('places');
        viewer.dataSources.add(ds);
        dataSourceRef.current = ds;

        for (const place of PLACES) {
            const dist = maxDistance(place);
            ds.entities.add(new Entity({
                id: `place-${place.name}-${place.lat}`,
                name: place.name,
                position: Cartesian3.fromDegrees(place.lon, place.lat),
                label: new LabelGraphics({
                    text: place.name,
                    font: fontSize(place),
                    fillColor: place.type === 'town' ? LABEL_COLOR_DIM : LABEL_COLOR,
                    outlineColor: OUTLINE_COLOR,
                    outlineWidth: 3,
                    style: LabelStyle.FILL_AND_OUTLINE,
                    verticalOrigin: VerticalOrigin.CENTER,
                    horizontalOrigin: HorizontalOrigin.LEFT,
                    pixelOffset: new Cartesian2(8, 0),
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    distanceDisplayCondition: new DistanceDisplayCondition(0, dist),
                }),
                point: new PointGraphics({
                    pixelSize: place.type === 'capital' ? 5 : 4,
                    color: POINT_COLOR,
                    outlineColor: LABEL_COLOR_DIM,
                    outlineWidth: 1,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    distanceDisplayCondition: new DistanceDisplayCondition(0, dist),
                }),
            }));
        }

        viewer.scene.requestRender();

        return () => {
            if (!viewer.isDestroyed()) viewer.dataSources.remove(ds, true);
            dataSourceRef.current = null;
        };
    }, [viewer]);

    // Popup builder
    useEffect(() => {
        register('places', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const place = PLACES.find((p) => `place-${p.name}-${p.lat}` === entity.id);
            if (!place) return null;

            const typeLabel = place.type === 'capital' ? 'Hovedstad' : place.type === 'city' ? 'Storby' : 'By';
            const fields: { label: string; value: string }[] = [
                { label: 'Land', value: place.country },
            ];
            if (place.population) {
                fields.push({ label: 'Befolkning', value: formatPopulation(place.population) });
            }
            fields.push(
                { label: 'Type', value: typeLabel },
                { label: 'Koordinater', value: `${place.lat.toFixed(2)}°N, ${place.lon.toFixed(2)}°Ø` },
            );

            return {
                title: `${place.name}, ${place.country}`,
                icon: '\uD83D\uDCCD',
                color: '#8899aa',
                fields,
                linkUrl: `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=12/${place.lat}/${place.lon}`,
                linkLabel: 'Vis i OpenStreetMap',
            };
        });
        return () => unregister('places');
    }, [register, unregister]);

    // Tooltip builder
    useEffect(() => {
        tooltipReg('places', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const place = PLACES.find((p) => `place-${p.name}-${p.lat}` === entity.id);
            if (!place) return null;
            const sub = place.population
                ? `${place.country} · ${formatPopulation(place.population)}`
                : place.country;
            return {
                title: place.name,
                subtitle: sub,
                icon: '\uD83D\uDCCD',
                color: '#8899aa',
            };
        });
        return () => tooltipUnreg('places');
    }, [tooltipReg, tooltipUnreg]);

    return null;
}
