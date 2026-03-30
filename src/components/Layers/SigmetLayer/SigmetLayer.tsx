import { useEffect, useRef, useCallback } from 'react';
import {
    CustomDataSource,
    Entity,
    Cartesian3,
    Color,
    PolygonHierarchy,
    PolygonGraphics,
    ConstantProperty,
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayers } from '@/context/LayerContext';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { usePollingData } from '@/hooks/usePollingData';
import { fetchSigmets } from '@/services/sigmet';
import { type Sigmet } from '@/types/sigmet';

const POLL_MS = 30 * 60 * 1000; // 30 min

const HAZARD_STYLES: Record<string, { color: string; label: string; icon: string }> = {
    TURB: { color: '#ff8800', label: 'Turbulens',      icon: '💨' },
    ICE:  { color: '#00ccff', label: 'Ising',           icon: '🧊' },
    IFR:  { color: '#aaaaaa', label: 'IFR-forhold',     icon: '☁' },
    MTN:  { color: '#886644', label: 'Fjellskygge',     icon: '⛰' },
    PCPN: { color: '#4488ff', label: 'Intens nedbør',   icon: '🌧' },
    VA:   { color: '#777777', label: 'Vulkanaske',      icon: '🌋' },
    TROP: { color: '#cc44ff', label: 'Tropisk syklon',  icon: '🌀' },
};

const DEFAULT_STYLE = { color: '#ff8800', label: 'Luftromsvarsel', icon: '✈' };

function hazardColor(hazard: string): Color {
    return Color.fromCssColorString(HAZARD_STYLES[hazard]?.color ?? DEFAULT_STYLE.color);
}

function formatAlt(ft: number | null): string {
    if (ft === null) return '?';
    if (ft === 0) return 'Bakken';
    return `FL${Math.round(ft / 100)}`;
}

function formatUtc(iso: string): string {
    if (!iso) return '?';
    return new Date(iso).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + 'Z';
}

export function SigmetLayer() {
    const viewer = useViewer();
    const { isVisible, setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } = useLayers();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const visible = isVisible('sigmet');
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const sigmetsRef = useRef<Sigmet[]>([]);
    // Map entityId → sigmetId for O(1) lookup (multi-polygon entities share a sigmet)
    const entityMapRef = useRef<Map<string, string>>(new Map());

    const { data: sigmets, loading, error, lastUpdated } = usePollingData(fetchSigmets, POLL_MS, visible);
    if (sigmets) sigmetsRef.current = sigmets;

    useEffect(() => { setLayerError('sigmet', error); }, [error, setLayerError]);
    useEffect(() => { setLayerLastUpdated('sigmet', lastUpdated); }, [lastUpdated, setLayerLastUpdated]);
    useEffect(() => { setLayerLoading('sigmet', loading); }, [loading, setLayerLoading]);

    useEffect(() => {
        register('sigmet', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const sigmetId = entityMapRef.current.get(entity.id);
            const s = sigmetsRef.current.find((x) => x.id === sigmetId);
            if (!s) return null;
            const style = HAZARD_STYLES[s.hazard] ?? DEFAULT_STYLE;
            const severityMap: Record<string, string> = { MOD: 'Moderat', SEV: 'Alvorlig', EXTM: 'Ekstrem' };
            return {
                title: style.label,
                icon: style.icon,
                color: style.color,
                fields: [
                    ...(s.severity ? [{ label: 'Alvorlighet', value: severityMap[s.severity] ?? s.severity }] : []),
                    { label: 'Høyde', value: `${formatAlt(s.altitudeLow)} – ${formatAlt(s.altitudeHigh)}` },
                    ...(s.area ? [{ label: 'FIR', value: s.area }] : []),
                    { label: 'Gyldig', value: `${formatUtc(s.validFrom)} – ${formatUtc(s.validTo)}` },
                ],
            };
        });
        return () => unregister('sigmet');
    }, [register, unregister]);

    useEffect(() => {
        tooltipRegister('sigmet', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const sigmetId = entityMapRef.current.get(entity.id);
            const s = sigmetsRef.current.find((x) => x.id === sigmetId);
            if (!s) return null;
            const style = HAZARD_STYLES[s.hazard] ?? DEFAULT_STYLE;
            return {
                title: style.label,
                subtitle: `${formatAlt(s.altitudeLow)} – ${formatAlt(s.altitudeHigh)}`,
                icon: style.icon,
                color: style.color,
            };
        });
        return () => tooltipUnregister('sigmet');
    }, [tooltipRegister, tooltipUnregister]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('sigmet');
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
        if (!ds || !sigmets) return;
        setLayerCount('sigmet', sigmets.length);
        ds.entities.removeAll();
        entityMapRef.current.clear();

        for (const s of sigmets) {
            const color = hazardColor(s.hazard);
            const style = HAZARD_STYLES[s.hazard] ?? DEFAULT_STYLE;
            for (let pi = 0; pi < s.coordinates.length; pi++) {
                const ring = s.coordinates[pi];
                if (!ring || ring.length < 3) continue;
                try {
                    const positions = ring
                        .filter(([lon, lat]) => isFinite(lon) && isFinite(lat))
                        .map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat));
                    if (positions.length < 3) continue;
                    const entityId = `${s.id}-${pi}`;
                    entityMapRef.current.set(entityId, s.id);
                    ds.entities.add(new Entity({
                        id: entityId,
                        name: style.label,
                        polygon: new PolygonGraphics({
                            hierarchy: new ConstantProperty(new PolygonHierarchy(positions)),
                            material: color.withAlpha(0.18),
                            outline: new ConstantProperty(true),
                            outlineColor: new ConstantProperty(color.withAlpha(0.75)),
                            outlineWidth: new ConstantProperty(2),
                            heightReference: new ConstantProperty(1), // CLAMP_TO_GROUND
                        }),
                    }));
                } catch { /* skip invalid ring */ }
            }
        }

        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, [sigmets, viewer, setLayerCount]);

    useEffect(() => { updateEntities(); }, [updateEntities]);

    return null;
}
