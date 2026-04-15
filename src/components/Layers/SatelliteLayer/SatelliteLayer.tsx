import { useEffect, useRef, useCallback, useState } from 'react';
import {
    CustomDataSource,
    Entity,
    Cartesian3,
    Color,
    PointGraphics,
    ConstantPositionProperty,
    ConstantProperty,
    PolylineGlowMaterialProperty,
    ColorMaterialProperty,
    PolygonHierarchy,
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { useTracking } from '@/context/TrackingContext';
import { usePollingData } from '@/hooks/usePollingData';
import { syncEntities } from '@/utils/syncEntities';
import { configureCluster } from '@/utils/cluster';
import { fetchTLEData } from '@/services/celestrak';
import { computePositions, computeGroundTrack, computeFootprint } from '@/utils/satellite';
import { type SatelliteRecord } from '@/types/satellite';

const TRACK_PAST_COLOR = Color.fromCssColorString('#00ff88').withAlpha(0.5);
const TRACK_FUTURE_COLOR = Color.fromCssColorString('#00ffcc').withAlpha(0.8);
const FOOTPRINT_COLOR = Color.fromCssColorString('#00ff88').withAlpha(0.08);
const FOOTPRINT_OUTLINE = Color.fromCssColorString('#00ff88').withAlpha(0.6);

const SAT_COLOR = Color.fromCssColorString('#00ff88');
const TLE_REFRESH_MS = 30 * 60 * 1000;
const POSITION_REFRESH_MS = 10_000;

export function SatelliteLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const { trackedEntityId } = useTracking();
    const visible = isVisible('satellites');
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const trackDsRef = useRef<CustomDataSource | null>(null);
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
                followEntityId: sat.noradId,
                fields: [
                    { label: 'NORAD ID', value: sat.noradId },
                    { label: 'Breddegrad', value: sat.lat.toFixed(2), unit: '°' },
                    { label: 'Lengdegrad', value: sat.lon.toFixed(2), unit: '°' },
                    { label: 'Høyde', value: sat.alt.toFixed(0), unit: 'km' },
                    { label: 'Hastighet', value: sat.velocity.toFixed(1), unit: 'km/s' },
                ],
                description: `Trykk "Følg" for å låse kameraet til satellittens bane og se Jorden fra orbit.`,
            };
        });
        return () => unregister('satellites');
    }, [register, unregister]);

    // Register tooltip builder
    useEffect(() => {
        tooltipRegister('satellites', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const positions = computePositions(
                tleRef.current.filter((t) => t.tle1.substring(2, 7).trim() === entity.id)
            );
            const sat = positions[0];
            if (!sat) return null;
            return {
                title: sat.name,
                subtitle: `${sat.alt.toFixed(0)} km · ${sat.velocity.toFixed(1)} km/s`,
                icon: '🛰',
                color: '#00ff88',
            };
        });
        return () => tooltipUnregister('satellites');
    }, [tooltipRegister, tooltipUnregister]);

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
        configureCluster(ds, { pixelRange: 50, minimumClusterSize: 5, color: '#00ff88' });
        viewer.dataSources.add(ds);
        dataSourceRef.current = ds;
        return () => {
            if (!viewer.isDestroyed()) viewer.dataSources.remove(ds, true);
            dataSourceRef.current = null;
        };
    }, [viewer]);

    // DataSource for ground track + footprint (én aktiv satellitt om gangen)
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const trackDs = new CustomDataSource('satellites-track');
        viewer.dataSources.add(trackDs);
        trackDsRef.current = trackDs;
        return () => {
            if (!viewer.isDestroyed()) viewer.dataSources.remove(trackDs, true);
            trackDsRef.current = null;
        };
    }, [viewer]);

    // Tegn ground track + footprint for aktiv (fulgt) satellitt
    useEffect(() => {
        const trackDs = trackDsRef.current;
        if (!trackDs) return;
        trackDs.entities.removeAll();

        if (!trackedEntityId || !tleData.length) {
            if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
            return;
        }

        const rec = tleData.find((t) => t.tle1.substring(2, 7).trim() === trackedEntityId);
        if (!rec) return;

        const { past, future } = computeGroundTrack(rec, 45, 45, 1);

        // Tidligere bane (halvgjennomsiktig)
        // NB: PolylineGlowMaterialProperty krever clampToGround: false
        if (past.length >= 2) {
            trackDs.entities.add(new Entity({
                id: 'track-past',
                polyline: {
                    positions: new ConstantProperty(
                        past.map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat, 10_000))
                    ),
                    width: 1.5,
                    material: new PolylineGlowMaterialProperty({
                        glowPower: 0.15,
                        color: TRACK_PAST_COLOR,
                    }),
                    clampToGround: false,
                },
            }));
        }

        // Fremtidig bane (lysere, mer fremtredende)
        if (future.length >= 2) {
            trackDs.entities.add(new Entity({
                id: 'track-future',
                polyline: {
                    positions: new ConstantProperty(
                        future.map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat, 10_000))
                    ),
                    width: 2,
                    material: new PolylineGlowMaterialProperty({
                        glowPower: 0.3,
                        color: TRACK_FUTURE_COLOR,
                    }),
                    clampToGround: false,
                },
            }));
        }

        // Dekningsflate (footprint) — satellittens synsfelt på overflaten
        const positions = computePositions([rec]);
        const sat = positions[0];
        if (sat) {
            const fpPoints = computeFootprint(sat.lat, sat.lon, sat.alt, 5, 72);
            if (fpPoints.length >= 3) {
                trackDs.entities.add(new Entity({
                    id: 'track-footprint',
                    polygon: {
                        hierarchy: new ConstantProperty(
                            new PolygonHierarchy(
                                fpPoints.map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat, 0))
                            )
                        ),
                        material: new ColorMaterialProperty(FOOTPRINT_COLOR),
                        outline: true,
                        outlineColor: new ConstantProperty(FOOTPRINT_OUTLINE),
                        outlineWidth: new ConstantProperty(1.5),
                        heightReference: new ConstantProperty(0),
                    },
                }));
            }
        }

        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [trackedEntityId, tleData, viewer]);

    useEffect(() => {
        if (dataSourceRef.current) dataSourceRef.current.show = visible;
        if (trackDsRef.current) trackDsRef.current.show = visible;
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [visible, viewer]);

    const updatePositions = useCallback(() => {
        const ds = dataSourceRef.current;
        if (!ds || !tleData.length) return;
        const positions = computePositions(tleData);
        setLayerCount('satellites', positions.length);
        syncEntities({
            ds,
            items: positions,
            getId: (sat) => sat.noradId,
            onUpdate: (entity, sat) => {
                (entity.position as ConstantPositionProperty).setValue(
                    Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt * 1000)
                );
            },
            onCreate: (sat) => new Entity({
                id: sat.noradId,
                name: sat.name,
                position: Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt * 1000),
                point: new PointGraphics({
                    pixelSize: 4, color: SAT_COLOR,
                    outlineColor: Color.fromCssColorString('#00ff8866'), outlineWidth: 1,
                }),
            }),
            viewer,
        });
    }, [tleData, viewer, setLayerCount]);

    useEffect(() => {
        if (!visible || !tleData.length) return;
        updatePositions();
        const id = setInterval(updatePositions, POSITION_REFRESH_MS);
        return () => clearInterval(id);
    }, [visible, tleData, updatePositions]);

    return null;
}
