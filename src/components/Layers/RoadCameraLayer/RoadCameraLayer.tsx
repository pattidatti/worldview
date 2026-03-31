import { useEffect, useRef, useCallback } from 'react';
import {
    CustomDataSource,
    Entity,
    Cartesian3,
    Color,
    PolygonHierarchy,
    PolygonGraphics,
    BillboardGraphics,
    VerticalOrigin,
    HorizontalOrigin,
    HeightReference,
    ConstantProperty,
    ConstantPositionProperty,
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { usePollingData } from '@/hooks/usePollingData';
import { fetchDotCameras } from '@/services/dot-cameras';
import { type RoadCamera } from '@/types/roadCamera';

const POLL_MS = 5 * 60 * 1000; // 5 min
const COLOR = '#00e5ff';
const CONE_RANGE_M = 300;
const CONE_FOV_DEG = 80;
const CONE_STEPS = 14;

const CAMERA_SVG = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
        <circle cx="11" cy="11" r="10" fill="#1a1a2e" stroke="${COLOR}" stroke-width="1.5"/>
        <rect x="5" y="8" width="8" height="6" rx="1.5" fill="${COLOR}"/>
        <polygon points="13,8.5 18,7 18,15 13,13.5" fill="${COLOR}"/>
        <circle cx="9" cy="11" r="2" fill="#1a1a2e" opacity="0.6"/>
    </svg>`
)}`;

/**
 * Compute FOV cone polygon vertices for a camera.
 * heading: degrees clockwise from North (0=N, 90=E, 180=S, 270=W)
 */
function conePositions(lat: number, lon: number, heading: number): Cartesian3[] {
    const headingRad = (heading * Math.PI) / 180;
    const halfFovRad = (CONE_FOV_DEG / 2 * Math.PI) / 180;
    const latRad = (lat * Math.PI) / 180;

    // Meters per degree at this latitude
    const mPerDegLat = 111_320;
    const mPerDegLon = 111_320 * Math.cos(latRad);

    const positions: Cartesian3[] = [Cartesian3.fromDegrees(lon, lat)];

    for (let i = 0; i <= CONE_STEPS; i++) {
        const angle = headingRad - halfFovRad + (CONE_FOV_DEG * Math.PI / 180 * i) / CONE_STEPS;
        const dLat = CONE_RANGE_M * Math.cos(angle) / mPerDegLat;
        const dLon = CONE_RANGE_M * Math.sin(angle) / mPerDegLon;
        positions.push(Cartesian3.fromDegrees(lon + dLon, lat + dLat));
    }

    return positions;
}

export function RoadCameraLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const visible = isVisible('roadCameras');
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const camerasRef = useRef<RoadCamera[]>([]);

    const { data: cameras, loading, error, lastUpdated } = usePollingData(fetchDotCameras, POLL_MS, visible);
    if (cameras) camerasRef.current = cameras;

    useEffect(() => { setLayerError('roadCameras', error); }, [error, setLayerError]);
    useEffect(() => { setLayerLastUpdated('roadCameras', lastUpdated); }, [lastUpdated, setLayerLastUpdated]);
    useEffect(() => { setLayerLoading('roadCameras', loading); }, [loading, setLayerLoading]);

    useEffect(() => {
        register('roadCameras', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            // Strip cam- or cone- prefix to get raw camera id
            const rawId = entity.id.replace(/^(?:cam|cone)-/, '');
            const cam = camerasRef.current.find((c) => c.id === rawId);
            if (!cam) return null;
            return {
                title: cam.name,
                icon: '📷',
                color: COLOR,
                imageUrl: cam.imageUrl || undefined,
                imageSize: 'large' as const,
                fields: [
                    ...(cam.road ? [{ label: 'Vei', value: cam.road }] : []),
                    ...(cam.heading !== undefined ? [{ label: 'Retning', value: `${Math.round(cam.heading)}°` }] : []),
                    { label: 'Kilde', value: 'Caltrans / DOT' },
                ],
            };
        });
        return () => unregister('roadCameras');
    }, [register, unregister]);

    useEffect(() => {
        tooltipRegister('roadCameras', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const baseId = entity.id.replace(/^cone-/, '');
            const cam = camerasRef.current.find((c) => `cam-${c.id}` === baseId);
            if (!cam) return null;
            return {
                title: cam.name,
                subtitle: cam.road,
                icon: '📷',
                color: COLOR,
            };
        });
        return () => tooltipUnregister('roadCameras');
    }, [tooltipRegister, tooltipUnregister]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('roadCameras');
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
        if (!ds || !cameras) return;
        setLayerCount('roadCameras', cameras.length);

        const existing = new Map<string, Entity>();
        for (const entity of ds.entities.values) existing.set(entity.id, entity);
        const seen = new Set<string>();
        const coneColor = Color.fromCssColorString(COLOR);

        for (const cam of cameras) {
            const camId = `cam-${cam.id}`;
            const coneId = `cone-${cam.id}`;
            seen.add(camId);
            seen.add(coneId);

            const pos = Cartesian3.fromDegrees(cam.lon, cam.lat);

            // Camera billboard
            const camEntity = existing.get(camId);
            if (camEntity) {
                (camEntity.position as ConstantPositionProperty).setValue(pos);
            } else {
                ds.entities.add(new Entity({
                    id: camId,
                    name: cam.name,
                    position: pos,
                    billboard: new BillboardGraphics({
                        image: CAMERA_SVG,
                        width: new ConstantProperty(22),
                        height: new ConstantProperty(22),
                        verticalOrigin: new ConstantProperty(VerticalOrigin.CENTER),
                        horizontalOrigin: new ConstantProperty(HorizontalOrigin.CENTER),
                        heightReference: new ConstantProperty(HeightReference.CLAMP_TO_GROUND),
                        disableDepthTestDistance: new ConstantProperty(Number.POSITIVE_INFINITY),
                    }),
                }));
            }

            // FOV cone — only if heading is available
            if (cam.heading !== undefined) {
                const coneVerts = conePositions(cam.lat, cam.lon, cam.heading);
                const coneEntity = existing.get(coneId);
                if (coneEntity) {
                    if (coneEntity.polygon?.hierarchy) {
                        (coneEntity.polygon.hierarchy as ConstantProperty).setValue(
                            new PolygonHierarchy(coneVerts)
                        );
                    }
                } else {
                    ds.entities.add(new Entity({
                        id: coneId,
                        name: cam.name,
                        polygon: new PolygonGraphics({
                            hierarchy: new ConstantProperty(new PolygonHierarchy(coneVerts)),
                            material: coneColor.withAlpha(0.25),
                            outline: new ConstantProperty(true),
                            outlineColor: new ConstantProperty(coneColor.withAlpha(0.7)),
                            outlineWidth: new ConstantProperty(1.5),
                            heightReference: new ConstantProperty(1), // CLAMP_TO_GROUND
                        }),
                    }));
                }
            }
        }

        for (const [id] of existing) {
            if (!seen.has(id)) ds.entities.removeById(id);
        }

        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [cameras, viewer, setLayerCount]);

    useEffect(() => { updateEntities(); }, [updateEntities]);

    return null;
}
