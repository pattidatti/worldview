import { useEffect, useRef, useCallback, useState } from 'react';
import {
    CustomDataSource,
    Entity,
    Cartesian3,
    Color,
    PointGraphics,
    PolylineGraphics,
    PolygonGraphics,
    PolygonHierarchy,
    ConstantProperty,
    ColorMaterialProperty,
    PolylineDashMaterialProperty,
    HeightReference,
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { usePollingData } from '@/hooks/usePollingData';
import { useViewport } from '@/hooks/useViewport';
import { configureCluster } from '@/utils/cluster';
import { fetchInfrastructure } from '@/services/sodir';
import { fetchOverpassInfrastructure } from '@/services/overpass';
import { type InfrastructureData, type OverpassInfrastructureData } from '@/types/infrastructure';

const POLL_MS = 24 * 60 * 60 * 1000; // 24 hours
const INFRA_COLOR = '#ff9800';

const MEDIUM_COLORS: Record<string, string> = {
    GAS: '#ff4444',
    OIL: '#4CAF50',
    CONDENSATE: '#e91e63',
    'OIL AND CONDENSATE': '#8BC34A',
};

function getMediumColor(medium: string): Color {
    const hex = MEDIUM_COLORS[medium.toUpperCase()] ?? INFRA_COLOR;
    return Color.fromCssColorString(hex);
}

const PLATFORM_SVG = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
  <rect x="3" y="12" width="14" height="3" rx="1" fill="${INFRA_COLOR}" stroke="#000" stroke-width="0.5"/>
  <rect x="6" y="4" width="8" height="8" rx="1" fill="${INFRA_COLOR}" stroke="#000" stroke-width="0.5"/>
  <line x1="4" y1="15" x2="2" y2="19" stroke="${INFRA_COLOR}" stroke-width="1.5"/>
  <line x1="16" y1="15" x2="18" y2="19" stroke="${INFRA_COLOR}" stroke-width="1.5"/>
  <line x1="10" y1="15" x2="10" y2="19" stroke="${INFRA_COLOR}" stroke-width="1.5"/>
  <rect x="9" y="1" width="2" height="3" fill="${INFRA_COLOR}" stroke="#000" stroke-width="0.3"/>
</svg>`)}`;

const PLATFORM_SVG_SM = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20">
  <rect x="3" y="12" width="14" height="3" rx="1" fill="${INFRA_COLOR}" opacity="0.7" stroke="#000" stroke-width="0.5"/>
  <rect x="6" y="4" width="8" height="8" rx="1" fill="${INFRA_COLOR}" opacity="0.7" stroke="#000" stroke-width="0.5"/>
  <line x1="4" y1="15" x2="2" y2="19" stroke="${INFRA_COLOR}" opacity="0.7" stroke-width="1.5"/>
  <line x1="16" y1="15" x2="18" y2="19" stroke="${INFRA_COLOR}" opacity="0.7" stroke-width="1.5"/>
  <line x1="10" y1="15" x2="10" y2="19" stroke="${INFRA_COLOR}" opacity="0.7" stroke-width="1.5"/>
  <rect x="9" y="1" width="2" height="3" fill="${INFRA_COLOR}" opacity="0.7" stroke="#000" stroke-width="0.3"/>
</svg>`)}`;

const SUBSTANCE_COLORS: Record<string, string> = {
    oil: '#4CAF50',
    gas: '#ff4444',
    petroleum: '#ff9800',
};

function getSubstanceColor(substance: string): Color {
    const hex = SUBSTANCE_COLORS[substance.toLowerCase()] ?? INFRA_COLOR;
    return Color.fromCssColorString(hex);
}

export function InfrastructureLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const visible = isVisible('infrastructure');
    const viewport = useViewport(viewer, 2000);
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const osmDsRef = useRef<CustomDataSource | null>(null);
    const dataRef = useRef<InfrastructureData>({ facilities: [], pipelines: [], fields: [] });
    const osmDataRef = useRef<OverpassInfrastructureData>({ pipelines: [], platforms: [], wells: [] });
    const [osmCount, setOsmCount] = useState(0);

    const { data, loading, error, lastUpdated } = usePollingData(fetchInfrastructure, POLL_MS, visible);
    if (data) dataRef.current = data;

    useEffect(() => { setLayerError('infrastructure', error); }, [error, setLayerError]);
    useEffect(() => { setLayerLastUpdated('infrastructure', lastUpdated); }, [lastUpdated, setLayerLastUpdated]);

    // Popup builder (SODIR + OSM)
    useEffect(() => {
        register('infrastructure', (entity: Entity) => {
            const inSodir = dataSourceRef.current?.entities.contains(entity);
            const inOsm = osmDsRef.current?.entities.contains(entity);
            if (!inSodir && !inOsm) return null;
            const id = entity.id;

            if (id.startsWith('facility-')) {
                const fac = dataRef.current.facilities.find((f) => `facility-${f.id}` === id);
                if (!fac) return null;
                return {
                    title: fac.name,
                    icon: '🛢',
                    color: INFRA_COLOR,
                    fields: [
                        { label: 'Type', value: fac.kind },
                        { label: 'Operatør', value: fac.operator },
                        ...(fac.functions ? [{ label: 'Funksjon', value: fac.functions }] : []),
                        ...(fac.belongsTo ? [{ label: 'Tilhører felt', value: fac.belongsTo }] : []),
                        { label: 'Vanndybde', value: fac.waterDepth ? `${fac.waterDepth} m` : 'Ukjent' },
                        { label: 'Status', value: fac.phase },
                        ...(fac.startupDate ? [{ label: 'Oppstart', value: new Date(fac.startupDate).getFullYear().toString() }] : []),
                    ],
                };
            }

            if (id.startsWith('pipeline-')) {
                const ppl = dataRef.current.pipelines.find((p) => `pipeline-${p.id}` === id);
                if (!ppl) return null;
                return {
                    title: ppl.name || `Rørledning ${ppl.id}`,
                    icon: '🛢',
                    color: MEDIUM_COLORS[ppl.medium.toUpperCase()] ?? INFRA_COLOR,
                    fields: [
                        { label: 'Medium', value: ppl.medium },
                        { label: 'Operatør', value: ppl.operator },
                        ...(ppl.dimension ? [{ label: 'Dimensjon', value: `${ppl.dimension}"` }] : []),
                        ...(ppl.fromFacility ? [{ label: 'Fra', value: ppl.fromFacility }] : []),
                        ...(ppl.toFacility ? [{ label: 'Til', value: ppl.toFacility }] : []),
                        ...(ppl.belongsTo ? [{ label: 'Tilhører felt', value: ppl.belongsTo }] : []),
                        { label: 'Vanndybde', value: ppl.waterDepth ? `${ppl.waterDepth} m` : 'Ukjent' },
                        { label: 'Fase', value: ppl.phase },
                    ],
                };
            }

            if (id.startsWith('field-')) {
                const fld = dataRef.current.fields.find((f) => `field-${f.id}` === id);
                if (!fld) return null;
                return {
                    title: fld.name,
                    icon: '🛢',
                    color: INFRA_COLOR,
                    fields: [
                        { label: 'Status', value: fld.status },
                        { label: 'Operatør', value: fld.operator },
                        { label: 'HC-type', value: fld.hcType },
                        ...(fld.discoveryYear ? [{ label: 'Oppdagelsesår', value: String(fld.discoveryYear) }] : []),
                        { label: 'Område', value: fld.mainArea },
                    ],
                };
            }

            // OSM entities
            if (id.startsWith('osm-way-')) {
                const ppl = osmDataRef.current.pipelines.find((p) => p.id === id);
                if (ppl) {
                    return {
                        title: ppl.name || 'Rørledning (OSM)',
                        icon: '🛢',
                        color: SUBSTANCE_COLORS[ppl.substance.toLowerCase()] ?? INFRA_COLOR,
                        fields: [
                            ...(ppl.substance ? [{ label: 'Medium', value: ppl.substance }] : []),
                            ...(ppl.operator ? [{ label: 'Operatør', value: ppl.operator }] : []),
                            { label: 'Kilde', value: 'OpenStreetMap' },
                        ],
                    };
                }
                const plat = osmDataRef.current.platforms.find((p) => p.id === id);
                if (plat) {
                    return {
                        title: plat.name || 'Plattform (OSM)',
                        icon: '🛢',
                        color: INFRA_COLOR,
                        fields: [
                            ...(plat.operator ? [{ label: 'Operatør', value: plat.operator }] : []),
                            { label: 'Kilde', value: 'OpenStreetMap' },
                        ],
                    };
                }
            }

            if (id.startsWith('osm-node-')) {
                const plat = osmDataRef.current.platforms.find((p) => p.id === id);
                if (plat) {
                    return {
                        title: plat.name || 'Plattform (OSM)',
                        icon: '🛢',
                        color: INFRA_COLOR,
                        fields: [
                            ...(plat.operator ? [{ label: 'Operatør', value: plat.operator }] : []),
                            { label: 'Kilde', value: 'OpenStreetMap' },
                        ],
                    };
                }
                const well = osmDataRef.current.wells.find((w) => w.id === id);
                if (well) {
                    return {
                        title: well.name || 'Petroleumsbrønn (OSM)',
                        icon: '🛢',
                        color: INFRA_COLOR,
                        fields: [
                            ...(well.operator ? [{ label: 'Operatør', value: well.operator }] : []),
                            { label: 'Kilde', value: 'OpenStreetMap' },
                        ],
                    };
                }
            }

            return null;
        });
        return () => unregister('infrastructure');
    }, [register, unregister]);

    // Register tooltip builder (SODIR + OSM)
    useEffect(() => {
        tooltipRegister('infrastructure', (entity: Entity) => {
            const inSodir = dataSourceRef.current?.entities.contains(entity);
            const inOsm = osmDsRef.current?.entities.contains(entity);
            if (!inSodir && !inOsm) return null;
            const id = entity.id;
            if (id.startsWith('facility-')) {
                const fac = dataRef.current.facilities.find((f) => `facility-${f.id}` === id);
                if (!fac) return null;
                return { title: fac.name, subtitle: `${fac.kind} · ${fac.operator}`, icon: '🛢', color: INFRA_COLOR };
            }
            if (id.startsWith('pipeline-')) {
                const ppl = dataRef.current.pipelines.find((p) => `pipeline-${p.id}` === id);
                if (!ppl) return null;
                return { title: ppl.name || `Rørledning ${ppl.id}`, subtitle: `${ppl.medium} · ${ppl.operator}`, icon: '🛢', color: MEDIUM_COLORS[ppl.medium.toUpperCase()] ?? INFRA_COLOR };
            }
            if (id.startsWith('field-')) {
                const fld = dataRef.current.fields.find((f) => `field-${f.id}` === id);
                if (!fld) return null;
                return { title: fld.name, subtitle: `${fld.status} · ${fld.operator}`, icon: '🛢', color: INFRA_COLOR };
            }
            // OSM
            if (id.startsWith('osm-way-')) {
                const ppl = osmDataRef.current.pipelines.find((p) => p.id === id);
                if (ppl) return { title: ppl.name || 'Rørledning', subtitle: [ppl.substance, ppl.operator].filter(Boolean).join(' · ') || 'OSM', icon: '🛢', color: SUBSTANCE_COLORS[ppl.substance.toLowerCase()] ?? INFRA_COLOR };
                const plat = osmDataRef.current.platforms.find((p) => p.id === id);
                if (plat) return { title: plat.name || 'Plattform', subtitle: plat.operator || 'OSM', icon: '🛢', color: INFRA_COLOR };
            }
            if (id.startsWith('osm-node-')) {
                const plat = osmDataRef.current.platforms.find((p) => p.id === id);
                if (plat) return { title: plat.name || 'Plattform', subtitle: plat.operator || 'OSM', icon: '🛢', color: INFRA_COLOR };
                const well = osmDataRef.current.wells.find((w) => w.id === id);
                if (well) return { title: well.name || 'Brønn', subtitle: well.operator || 'OSM', icon: '🛢', color: INFRA_COLOR };
            }
            return null;
        });
        return () => tooltipUnregister('infrastructure');
    }, [tooltipRegister, tooltipUnregister]);

    useEffect(() => { setLayerLoading('infrastructure', loading); }, [loading, setLayerLoading]);

    // Create data sources (SODIR + OSM)
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('infrastructure');
        configureCluster(ds, { pixelRange: 40, minimumClusterSize: 3, color: '#ff9800' });
        viewer.dataSources.add(ds);
        dataSourceRef.current = ds;

        const osmDs = new CustomDataSource('infrastructure-osm');
        viewer.dataSources.add(osmDs);
        osmDsRef.current = osmDs;

        return () => {
            if (!viewer.isDestroyed()) {
                viewer.dataSources.remove(ds, true);
                viewer.dataSources.remove(osmDs, true);
            }
            dataSourceRef.current = null;
            osmDsRef.current = null;
        };
    }, [viewer]);

    // Toggle visibility
    useEffect(() => {
        if (dataSourceRef.current) dataSourceRef.current.show = visible;
        if (osmDsRef.current) osmDsRef.current.show = visible;
    }, [visible]);

    const updateEntities = useCallback(() => {
        const ds = dataSourceRef.current;
        if (!ds || !data) return;

        const { facilities, pipelines, fields } = data;
        const sodirCount = facilities.length + pipelines.length + fields.length;
        setLayerCount('infrastructure', sodirCount + osmCount);
        ds.entities.removeAll();

        // Fields (polygons) — render first so they're behind other entities
        for (const field of fields) {
            try {
                const ring = field.rings[0];
                if (!ring || ring.length < 3) continue;
                const positions = ring
                    .filter(([lon, lat]) => isFinite(lon) && isFinite(lat))
                    .map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat));
                if (positions.length < 3) continue;
                ds.entities.add(new Entity({
                    id: `field-${field.id}`,
                    name: field.name,
                    polygon: new PolygonGraphics({
                        hierarchy: new PolygonHierarchy(positions),
                        material: new ColorMaterialProperty(Color.fromCssColorString(INFRA_COLOR).withAlpha(0.08)),
                        outline: true,
                        outlineColor: new ConstantProperty(Color.fromCssColorString(INFRA_COLOR).withAlpha(0.5)),
                        outlineWidth: new ConstantProperty(1),
                        height: new ConstantProperty(0),
                    }),
                }));
            } catch { /* skip bad geometry */ }
        }

        // Pipelines (polylines)
        for (const ppl of pipelines) {
            for (let i = 0; i < ppl.paths.length; i++) {
                try {
                    const coords = ppl.paths[i];
                    const positions = coords
                        .filter(([lon, lat]) => isFinite(lon) && isFinite(lat))
                        .map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat));
                    if (positions.length < 2) continue;
                    const entityId = ppl.paths.length > 1 ? `pipeline-${ppl.id}-${i}` : `pipeline-${ppl.id}`;
                    ds.entities.add(new Entity({
                        id: entityId,
                        name: ppl.name || `Rørledning ${ppl.id}`,
                        polyline: new PolylineGraphics({
                            positions,
                            width: new ConstantProperty(3),
                            material: ppl.phase === 'IN SERVICE'
                                ? new ColorMaterialProperty(getMediumColor(ppl.medium))
                                : new PolylineDashMaterialProperty({
                                    color: getMediumColor(ppl.medium).withAlpha(0.5),
                                    dashLength: new ConstantProperty(8),
                                }),
                        }),
                    }));
                } catch { /* skip bad geometry */ }
            }
        }

        // Facilities (points)
        for (const fac of facilities) {
            try {
                if (!isFinite(fac.lon) || !isFinite(fac.lat)) continue;
                ds.entities.add(new Entity({
                    id: `facility-${fac.id}`,
                    name: fac.name,
                    position: Cartesian3.fromDegrees(fac.lon, fac.lat, 0),
                    billboard: {
                        image: PLATFORM_SVG,
                        width: new ConstantProperty(20),
                        height: new ConstantProperty(20),
                        heightReference: new ConstantProperty(HeightReference.CLAMP_TO_GROUND),
                    },
                }));
            } catch { /* skip bad geometry */ }
        }

        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [data, viewer, setLayerCount, osmCount]);

    useEffect(() => { updateEntities(); }, [updateEntities]);

    // Overpass (OSM) — viewport-based fetch
    useEffect(() => {
        if (!visible || !viewport || !osmDsRef.current) return;
        let cancelled = false;

        fetchOverpassInfrastructure(viewport).then((osmData) => {
            if (cancelled || !osmDsRef.current) return;
            osmDataRef.current = osmData;
            const ds = osmDsRef.current;
            ds.entities.removeAll();

            const total = osmData.pipelines.length + osmData.platforms.length + osmData.wells.length;
            setOsmCount(total);

            // OSM Pipelines
            for (const ppl of osmData.pipelines) {
                try {
                    const positions = ppl.positions
                        .filter(([lon, lat]) => isFinite(lon) && isFinite(lat))
                        .map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat));
                    if (positions.length < 2) continue;
                    ds.entities.add(new Entity({
                        id: ppl.id,
                        name: ppl.name || 'Rørledning (OSM)',
                        polyline: new PolylineGraphics({
                            positions,
                            width: new ConstantProperty(2),
                            material: new ColorMaterialProperty(getSubstanceColor(ppl.substance).withAlpha(0.7)),
                        }),
                    }));
                } catch { /* skip */ }
            }

            // OSM Platforms
            for (const plat of osmData.platforms) {
                try {
                    if (!isFinite(plat.lon) || !isFinite(plat.lat)) continue;
                    ds.entities.add(new Entity({
                        id: plat.id,
                        name: plat.name || 'Plattform (OSM)',
                        position: Cartesian3.fromDegrees(plat.lon, plat.lat, 0),
                        billboard: {
                            image: PLATFORM_SVG_SM,
                            width: new ConstantProperty(16),
                            height: new ConstantProperty(16),
                            heightReference: new ConstantProperty(HeightReference.CLAMP_TO_GROUND),
                        },
                    }));
                } catch { /* skip */ }
            }

            // OSM Wells
            for (const well of osmData.wells) {
                try {
                    if (!isFinite(well.lon) || !isFinite(well.lat)) continue;
                    ds.entities.add(new Entity({
                        id: well.id,
                        name: well.name || 'Brønn (OSM)',
                        position: Cartesian3.fromDegrees(well.lon, well.lat, 0),
                        point: new PointGraphics({
                            pixelSize: 4,
                            color: Color.fromCssColorString(INFRA_COLOR).withAlpha(0.7),
                            outlineColor: Color.BLACK,
                            outlineWidth: 1,
                        }),
                    }));
                } catch { /* skip */ }
            }

            if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
        });

        return () => { cancelled = true; };
    }, [visible, viewport, viewer]);

    return null;
}
