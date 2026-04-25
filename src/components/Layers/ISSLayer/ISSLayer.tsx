import { useEffect, useRef, useCallback } from 'react';
import {
    CustomDataSource,
    Entity,
    Cartesian3,
    Color,
    ConstantPositionProperty,
    VerticalOrigin,
    HorizontalOrigin,
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayerActions, useLayerVisibility } from '@/store/layerStore';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { usePollingData } from '@/hooks/usePollingData';
import { fetchISS } from '@/services/iss';
import { type ISSPosition } from '@/types/iss';
import { TrailBuffer } from '@/utils/trailBuffer';

const POLL_MS = 5_000;
const TRAIL_CAP = 240; // ~20 min bane ved 5s polling
const ISS_COLOR = '#00cfff';

function createISSIcon(): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="18" fill="${ISS_COLOR}" fill-opacity="0.15" stroke="${ISS_COLOR}" stroke-width="1.5"/>
        <text x="20" y="26" text-anchor="middle" font-size="20">🛸</text>
    </svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function formatVelocity(kmh: number): string {
    return `${Math.round(kmh).toLocaleString('nb-NO')} km/t`;
}

function formatAltitude(km: number): string {
    return `${Math.round(km)} km`;
}

export function ISSLayer() {
    const viewer = useViewer();
    const { setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } = useLayerActions();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const visible = useLayerVisibility('iss');
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const trailDsRef = useRef<CustomDataSource | null>(null);
    const issRef = useRef<ISSPosition | null>(null);
    const trailRef = useRef(new TrailBuffer<Cartesian3>(TRAIL_CAP));

    const { data, loading, error, lastUpdated } = usePollingData(fetchISS, POLL_MS, visible, { startupJitterMs: 0 });
    if (data?.[0]) issRef.current = data[0];

    useEffect(() => { setLayerError('iss', error); }, [error, setLayerError]);
    useEffect(() => { setLayerLastUpdated('iss', lastUpdated); }, [lastUpdated, setLayerLastUpdated]);
    useEffect(() => { setLayerLoading('iss', loading); }, [loading, setLayerLoading]);

    useEffect(() => {
        register('iss', (entity: Entity) => {
            if (entity.id !== 'iss') return null;
            const p = issRef.current;
            if (!p) return null;
            return {
                title: 'Internasjonal Romstasjon (ISS)',
                icon: '🛸',
                color: ISS_COLOR,
                fields: [
                    { label: 'Høyde', value: formatAltitude(p.altitude) },
                    { label: 'Hastighet', value: formatVelocity(p.velocity) },
                    { label: 'Synlighet', value: p.visibility === 'daylight' ? 'Dagslys' : p.visibility === 'eclipsed' ? 'Formørkelse' : p.visibility },
                    { label: 'Posisjon', value: `${p.lat.toFixed(3)}°, ${p.lon.toFixed(3)}°` },
                    { label: 'Baneperiode', value: '~90 min' },
                ],
                linkUrl: 'https://www.nasa.gov/international-space-station/',
            };
        });
        return () => unregister('iss');
    }, [register, unregister]);

    useEffect(() => {
        tooltipRegister('iss', (entity: Entity) => {
            if (entity.id !== 'iss') return null;
            const p = issRef.current;
            return {
                title: 'Internasjonal Romstasjon',
                subtitle: p ? `${formatAltitude(p.altitude)} · ${formatVelocity(p.velocity)}` : '',
                icon: '🛸',
                color: ISS_COLOR,
            };
        });
        return () => tooltipUnregister('iss');
    }, [tooltipRegister, tooltipUnregister]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('iss');
        viewer.dataSources.add(ds);
        dataSourceRef.current = ds;
        const trailDs = new CustomDataSource('iss-trail');
        viewer.dataSources.add(trailDs);
        trailDsRef.current = trailDs;
        return () => {
            if (!viewer.isDestroyed()) {
                viewer.dataSources.remove(ds, true);
                viewer.dataSources.remove(trailDs, true);
            }
            dataSourceRef.current = null;
            trailDsRef.current = null;
        };
    }, [viewer]);

    useEffect(() => {
        if (dataSourceRef.current) dataSourceRef.current.show = visible;
        if (trailDsRef.current) trailDsRef.current.show = visible;
    }, [visible]);

    const updateEntities = useCallback(() => {
        const ds = dataSourceRef.current;
        const trailDs = trailDsRef.current;
        if (!ds || !trailDs || !data?.[0] || !viewer) return;

        const iss = data[0];
        const pos = Cartesian3.fromDegrees(iss.lon, iss.lat, iss.altitude * 1000);
        trailRef.current.push(pos);

        setLayerCount('iss', 1);

        const existing = ds.entities.getById('iss');
        if (existing) {
            (existing.position as ConstantPositionProperty).setValue(pos);
        } else {
            ds.entities.add(new Entity({
                id: 'iss',
                name: 'Internasjonal Romstasjon (ISS)',
                position: new ConstantPositionProperty(pos),
                billboard: {
                    image: createISSIcon(),
                    width: 40,
                    height: 40,
                    verticalOrigin: VerticalOrigin.CENTER,
                    horizontalOrigin: HorizontalOrigin.CENTER,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                },
            }));
        }

        // Oppdater trail
        const trailPts = trailRef.current.toArray();
        const trailId = 'iss-trail-line';
        const trailExisting = trailDs.entities.getById(trailId);
        if (trailExisting) {
            trailDs.entities.remove(trailExisting);
        }
        if (trailPts.length >= 2) {
            trailDs.entities.add(new Entity({
                id: trailId,
                polyline: {
                    positions: trailPts,
                    width: 1.5,
                    material: Color.fromCssColorString(ISS_COLOR).withAlpha(0.5),
                    clampToGround: false,
                },
            }));
        }

        viewer.scene.requestRender();
    }, [data, viewer, setLayerCount]);

    useEffect(() => { updateEntities(); }, [updateEntities]);

    return null;
}
