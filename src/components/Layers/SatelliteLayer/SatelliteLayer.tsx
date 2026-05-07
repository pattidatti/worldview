import { useEffect, useRef, useCallback, useState } from 'react';
import {
    CustomDataSource,
    Entity,
    Cartesian2,
    Cartesian3,
    Color,
    PointGraphics,
    ConstantPositionProperty,
    ConstantProperty,
    PolylineGlowMaterialProperty,
    ColorMaterialProperty,
    PolygonHierarchy,
    EllipsoidGeometry,
    GeometryInstance,
    Primitive,
    PerInstanceColorAppearance,
    ColorGeometryInstanceAttribute,
    Matrix4,
    ScreenSpaceEventHandler,
    ScreenSpaceEventType,
    Math as CesiumMath,
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useCinematic } from '@/context/CinematicContext';
import { useLayerActions, useLayerVisibility } from '@/store/layerStore';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { useTracking } from '@/context/TrackingContext';
import { useTimelineMode, useReplayCursor } from '@/context/TimelineModeContext';
import { usePollingData } from '@/hooks/usePollingData';
import { syncEntities } from '@/utils/syncEntities';
import { configureCluster } from '@/utils/cluster';
import { fetchTLEData } from '@/services/celestrak';
import { computePositions, computeGroundTrack, computeFootprint } from '@/utils/satellite';
import { type SatelliteRecord } from '@/types/satellite';
import { categorizeSatellite, SAT_COLORS } from '@/utils/satelliteCategory';

const TRACK_PAST_COLOR = Color.fromCssColorString('#00ff88').withAlpha(0.5);
const TRACK_FUTURE_COLOR = Color.fromCssColorString('#00ffcc').withAlpha(0.8);
const FOOTPRINT_COLOR = Color.fromCssColorString('#00ff88').withAlpha(0.08);
const FOOTPRINT_OUTLINE = Color.fromCssColorString('#00ff88').withAlpha(0.6);

const TLE_REFRESH_MS = 30 * 60 * 1000;
const POSITION_REFRESH_MS = 10_000;
const EARTH_R = 6_371_000;

const ORBITAL_SHELLS = [
    { id: 'leo', name: 'LEO',  altKm: 550,    color: 'rgba(0,255,136,0.07)',  labelColor: '#00ff88' },
    { id: 'meo', name: 'MEO',  altKm: 20200,  color: 'rgba(255,200,0,0.06)',  labelColor: '#ffc800' },
    { id: 'geo', name: 'GEO',  altKm: 35786,  color: 'rgba(0,212,255,0.05)',  labelColor: '#00d4ff' },
];

export function SatelliteLayer() {
    const viewer = useViewer();
    const { cinematicActiveRef } = useCinematic();
    const { setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } = useLayerActions();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const { trackedEntityId } = useTracking();
    const { mode } = useTimelineMode();
    const cursor = useReplayCursor(mode);
    const isReplay = mode === 'replay';
    const visible = useLayerVisibility('satellites');
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const trackDsRef = useRef<CustomDataSource | null>(null);
    const shellPrimitivesRef = useRef<Primitive[]>([]);
    const [tleData, setTleData] = useState<SatelliteRecord[]>([]);
    const tleRef = useRef<SatelliteRecord[]>([]);
    tleRef.current = tleData;
    const [showShells, setShowShells] = useState(false);

    // Register popup builder
    useEffect(() => {
        register('satellites', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const positions = computePositions(
                tleRef.current.filter((t) => t.tle1.substring(2, 7).trim() === entity.id)
            );
            const sat = positions[0];
            if (!sat) return null;
            const catColor = SAT_COLORS[categorizeSatellite(sat.name)];
            const orbitalRegime = sat.alt < 2000 ? 'LEO' : sat.alt < 35000 ? 'MEO' : 'GEO';
            return {
                title: sat.name,
                icon: '🛰',
                color: catColor,
                followEntityId: sat.noradId,
                fields: [
                    { label: 'NORAD ID', value: sat.noradId },
                    { label: 'Orbital', value: orbitalRegime },
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

    // Orbital shell-sfærer + klikk → fly to orbital høyde
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const { scene } = viewer;

        const primitives: Primitive[] = ORBITAL_SHELLS.map((shell) => {
            const r = EARTH_R + shell.altKm * 1000;
            const instance = new GeometryInstance({
                geometry: new EllipsoidGeometry({ radii: new Cartesian3(r, r, r), stackPartitions: 24, slicePartitions: 24 }),
                attributes: {
                    color: ColorGeometryInstanceAttribute.fromColor(
                        Color.fromCssColorString(shell.color)
                    ),
                },
                id: `orbital-shell-${shell.id}`,
                modelMatrix: Matrix4.IDENTITY.clone(),
            });
            return scene.primitives.add(new Primitive({
                geometryInstances: instance,
                appearance: new PerInstanceColorAppearance({ flat: true, translucent: true }),
                allowPicking: true,
                show: showShells && visible,
            }));
        });
        shellPrimitivesRef.current = primitives;

        const handler = new ScreenSpaceEventHandler(viewer.canvas);
        handler.setInputAction((click: { position: Cartesian2 }) => {
            const picked = scene.pick(click.position);
            if (!picked?.id || typeof picked.id !== 'string' || !picked.id.startsWith('orbital-shell-')) return;
            const shellId = picked.id.replace('orbital-shell-', '');
            const shell = ORBITAL_SHELLS.find((s) => s.id === shellId);
            if (!shell) return;
            const viewAlt = (EARTH_R + shell.altKm * 1000) * 2.2;
            viewer.camera.flyTo({
                destination: Cartesian3.fromDegrees(
                    CesiumMath.toDegrees(viewer.camera.positionCartographic.longitude),
                    CesiumMath.toDegrees(viewer.camera.positionCartographic.latitude),
                    viewAlt,
                ),
                duration: 2.0,
            });
        }, ScreenSpaceEventType.LEFT_CLICK);

        return () => {
            primitives.forEach((p) => { if (!scene.isDestroyed()) scene.primitives.remove(p); });
            shellPrimitivesRef.current = [];
            handler.destroy();
        };
    }, [viewer]); // eslint-disable-line react-hooks/exhaustive-deps

    // Synkroniser shell-synlighet
    useEffect(() => {
        shellPrimitivesRef.current.forEach((p) => { p.show = showShells && visible; });
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [showShells, visible, viewer]);

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
        // I replay-modus: propager TLE til cursor-tid. Ellers: nåtid.
        const time = isReplay ? new Date(cursor) : undefined;
        const positions = computePositions(tleData, time);
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
            onCreate: (sat) => {
                const cat = categorizeSatellite(sat.name);
                const satColor = Color.fromCssColorString(SAT_COLORS[cat]);
                return new Entity({
                    id: sat.noradId,
                    name: sat.name,
                    position: Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt * 1000),
                    point: new PointGraphics({
                        pixelSize: cat === 'iss' ? 6 : 4,
                        color: satColor,
                        outlineColor: satColor.withAlpha(0.4),
                        outlineWidth: 1,
                    }),
                });
            },
            viewer,
        });
    }, [tleData, viewer, setLayerCount, isReplay, cursor]);

    useEffect(() => {
        if (!visible || !tleData.length) return;
        updatePositions();
        // Live: oppdater hvert 10. sek. Replay: oppdater kun når cursor endres (styres av updatePositions sin useCallback).
        if (isReplay) return;
        const id = setInterval(() => {
            if (cinematicActiveRef.current) return;
            updatePositions();
        }, POSITION_REFRESH_MS);
        return () => clearInterval(id);
    }, [visible, tleData, updatePositions, isReplay, cinematicActiveRef]);

    // Shell-toggle knapp (rendret i DOM — bare synlig når satellitt-laget er aktivt)
    if (!visible) return null;

    return (
        <button
            onClick={() => setShowShells((v) => !v)}
            className="absolute z-10 font-mono text-[10px] px-2 py-1 rounded border transition-all cursor-pointer"
            style={{
                bottom: '96px',
                right: '12px',
                backgroundColor: showShells ? 'rgba(0,255,136,0.15)' : 'rgba(0,0,0,0.4)',
                borderColor: showShells ? '#00ff8880' : 'rgba(255,255,255,0.15)',
                color: showShells ? '#00ff88' : 'rgba(255,255,255,0.5)',
                backdropFilter: 'blur(8px)',
            }}
        >
            {showShells ? '⬡ Skjul orbitskall' : '⬡ Orbitskall'}
        </button>
    );
}
