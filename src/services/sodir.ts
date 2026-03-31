import { type Facility, type Pipeline, type Field, type InfrastructureData } from '@/types/infrastructure';

interface SodirGeometryPoint    { x: number; y: number }
interface SodirGeometryPolyline { paths: number[][][] }
interface SodirGeometryPolygon  { rings: number[][][] }
interface SodirFeature<G>       { geometry: G; attributes: Record<string, unknown> }

const BASE = 'https://factmaps.sodir.no/api/rest/services/DataService/Data/FeatureServer';
const PAGE_SIZE = 2000;

async function queryLayer<G>(layerId: number, outFields: string[], offset = 0): Promise<{ features: SodirFeature<G>[]; exceededTransferLimit: boolean }> {
    const params = new URLSearchParams({
        where: '1=1',
        outFields: outFields.join(','),
        outSR: '4326',
        f: 'json',
        resultRecordCount: String(PAGE_SIZE),
        resultOffset: String(offset),
    });
    const res = await fetch(`${BASE}/${layerId}/query?${params}`, {
        signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`SODIR API ${layerId}: ${res.status}`);
    return res.json();
}

async function queryAllPages<G>(layerId: number, outFields: string[]): Promise<SodirFeature<G>[]> {
    const all: SodirFeature<G>[] = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
        const result = await queryLayer<G>(layerId, outFields, offset);
        all.push(...result.features);
        hasMore = result.exceededTransferLimit === true;
        offset += PAGE_SIZE;
    }
    return all;
}

const FACILITY_FIELDS = [
    'fclNpdidFacility', 'fclName', 'fclKind', 'fclPhase', 'fclFunctions',
    'fclFixedOrMoveable', 'fclCurrentOperatorName', 'fclBelongsToName',
    'fclWaterDepth', 'fclStartupDate',
];

async function fetchFacilities(): Promise<Facility[]> {
    try {
        const features = await queryAllPages<SodirGeometryPoint>(6000, FACILITY_FIELDS);
        return features
            .filter((f) => f.geometry)
            .map((f) => ({
                id: String(f.attributes.fclNpdidFacility),
                name: String(f.attributes.fclName ?? ''),
                kind: String(f.attributes.fclKind ?? ''),
                phase: String(f.attributes.fclPhase ?? ''),
                functions: String(f.attributes.fclFunctions ?? ''),
                fixedOrMoveable: String(f.attributes.fclFixedOrMoveable ?? ''),
                operator: String(f.attributes.fclCurrentOperatorName ?? ''),
                belongsTo: String(f.attributes.fclBelongsToName ?? ''),
                waterDepth: Number(f.attributes.fclWaterDepth ?? 0),
                startupDate: f.attributes.fclStartupDate ? new Date(String(f.attributes.fclStartupDate)).toISOString() : null,
                lat: Number(f.geometry.y),
                lon: Number(f.geometry.x),
            }));
    } catch (e) {
        console.warn('[sodir] fetchFacilities feilet:', e);
        return [];
    }
}

const PIPELINE_FIELDS = [
    'pplNpdidPipeline', 'pplName', 'pplMedium', 'pplDimension',
    'cmpLongName', 'fclNameFrom', 'fclNameTo',
    'pplCurrentPhase', 'pplBelongsToName', 'pplWaterDepth',
];

async function fetchPipelines(): Promise<Pipeline[]> {
    try {
        const features = await queryAllPages<SodirGeometryPolyline>(6100, PIPELINE_FIELDS);
        return features
            .filter((f) => f.geometry?.paths?.length)
            .map((f) => ({
                id: String(f.attributes.pplNpdidPipeline),
                name: String(f.attributes.pplName ?? ''),
                medium: String(f.attributes.pplMedium ?? ''),
                dimension: Number(f.attributes.pplDimension ?? 0),
                operator: String(f.attributes.cmpLongName ?? ''),
                fromFacility: String(f.attributes.fclNameFrom ?? ''),
                toFacility: String(f.attributes.fclNameTo ?? ''),
                phase: String(f.attributes.pplCurrentPhase ?? ''),
                belongsTo: String(f.attributes.pplBelongsToName ?? ''),
                waterDepth: Number(f.attributes.pplWaterDepth ?? 0),
                paths: f.geometry.paths.map((path) =>
                    path.map(([lon, lat]) => [Number(lon), Number(lat)]),
                ),
            }));
    } catch (e) {
        console.warn('[sodir] fetchPipelines feilet:', e);
        return [];
    }
}

const FIELD_FIELDS = [
    'fldNpdidField', 'fldName', 'fldCurrentActivitySatus',
    'cmpLongName', 'fldHcType', 'fldDiscoveryYear', 'fldMainArea',
];

async function fetchFields(): Promise<Field[]> {
    try {
        const features = await queryAllPages<SodirGeometryPolygon>(7100, FIELD_FIELDS);
        return features
            .filter((f) => f.geometry?.rings?.length)
            .map((f) => ({
                id: String(f.attributes.fldNpdidField),
                name: String(f.attributes.fldName ?? ''),
                status: String(f.attributes.fldCurrentActivitySatus ?? ''),
                operator: String(f.attributes.cmpLongName ?? ''),
                hcType: String(f.attributes.fldHcType ?? ''),
                discoveryYear: Number(f.attributes.fldDiscoveryYear ?? 0),
                mainArea: String(f.attributes.fldMainArea ?? ''),
                rings: f.geometry.rings.map((ring) =>
                    ring.map(([lon, lat]) => [Number(lon), Number(lat)]),
                ),
            }));
    } catch (e) {
        console.warn('[sodir] fetchFields feilet:', e);
        return [];
    }
}

const CACHE_KEY = 'worldview_infrastructure';
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dager

interface CachedData {
    timestamp: number;
    data: InfrastructureData;
}

function loadCache(): InfrastructureData | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const cached: CachedData = JSON.parse(raw);
        if (Date.now() - cached.timestamp > CACHE_MAX_AGE_MS) {
            localStorage.removeItem(CACHE_KEY);
            return null;
        }
        if (!cached.data.facilities?.length && !cached.data.pipelines?.length && !cached.data.fields?.length) return null;
        return cached.data;
    } catch {
        localStorage.removeItem(CACHE_KEY);
        return null;
    }
}

function saveCache(data: InfrastructureData): void {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data }));
    } catch { /* localStorage full — ignorerer */ }
}

export async function fetchInfrastructure(): Promise<InfrastructureData> {
    const cached = loadCache();
    if (cached) return cached;

    const [facilities, pipelines, fields] = await Promise.all([
        fetchFacilities(),
        fetchPipelines(),
        fetchFields(),
    ]);
    const result = { facilities, pipelines, fields };

    if (facilities.length || pipelines.length || fields.length) {
        saveCache(result);
    }
    return result;
}
