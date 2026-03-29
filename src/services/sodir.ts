import { type Facility, type Pipeline, type Field, type InfrastructureData } from '@/types/infrastructure';

const BASE = 'https://factmaps.sodir.no/api/rest/services/DataService/Data/FeatureServer';
const PAGE_SIZE = 2000;

async function queryLayer(layerId: number, outFields: string[], offset = 0): Promise<{ features: any[]; exceededTransferLimit: boolean }> {
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

async function queryAllPages(layerId: number, outFields: string[]): Promise<any[]> {
    const all: any[] = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
        const result = await queryLayer(layerId, outFields, offset);
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
        const features = await queryAllPages(6000, FACILITY_FIELDS);
        return features
            .filter((f: any) => f.geometry)
            .map((f: any) => ({
                id: String(f.attributes.fclNpdidFacility),
                name: f.attributes.fclName ?? '',
                kind: f.attributes.fclKind ?? '',
                phase: f.attributes.fclPhase ?? '',
                functions: f.attributes.fclFunctions ?? '',
                fixedOrMoveable: f.attributes.fclFixedOrMoveable ?? '',
                operator: f.attributes.fclCurrentOperatorName ?? '',
                belongsTo: f.attributes.fclBelongsToName ?? '',
                waterDepth: f.attributes.fclWaterDepth ?? 0,
                startupDate: f.attributes.fclStartupDate ? new Date(f.attributes.fclStartupDate).toISOString() : null,
                lat: Number(f.geometry.y),
                lon: Number(f.geometry.x),
            }));
    } catch {
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
        const features = await queryAllPages(6100, PIPELINE_FIELDS);
        return features
            .filter((f: any) => f.geometry?.paths?.length)
            .map((f: any) => ({
                id: String(f.attributes.pplNpdidPipeline),
                name: f.attributes.pplName ?? '',
                medium: f.attributes.pplMedium ?? '',
                dimension: f.attributes.pplDimension ?? 0,
                operator: f.attributes.cmpLongName ?? '',
                fromFacility: f.attributes.fclNameFrom ?? '',
                toFacility: f.attributes.fclNameTo ?? '',
                phase: f.attributes.pplCurrentPhase ?? '',
                belongsTo: f.attributes.pplBelongsToName ?? '',
                waterDepth: f.attributes.pplWaterDepth ?? 0,
                paths: (f.geometry.paths as number[][][]).map((path) =>
                    path.map(([lon, lat]) => [Number(lon), Number(lat)]),
                ),
            }));
    } catch {
        return [];
    }
}

const FIELD_FIELDS = [
    'fldNpdidField', 'fldName', 'fldCurrentActivitySatus',
    'cmpLongName', 'fldHcType', 'fldDiscoveryYear', 'fldMainArea',
];

async function fetchFields(): Promise<Field[]> {
    try {
        const features = await queryAllPages(7100, FIELD_FIELDS);
        return features
            .filter((f: any) => f.geometry?.rings?.length)
            .map((f: any) => ({
                id: String(f.attributes.fldNpdidField),
                name: f.attributes.fldName ?? '',
                status: f.attributes.fldCurrentActivitySatus ?? '',
                operator: f.attributes.cmpLongName ?? '',
                hcType: f.attributes.fldHcType ?? '',
                discoveryYear: f.attributes.fldDiscoveryYear ?? 0,
                mainArea: f.attributes.fldMainArea ?? '',
                rings: (f.geometry.rings as number[][][]).map((ring) =>
                    ring.map(([lon, lat]) => [Number(lon), Number(lat)]),
                ),
            }));
    } catch {
        return [];
    }
}

export async function fetchInfrastructure(): Promise<InfrastructureData> {
    const [facilities, pipelines, fields] = await Promise.all([
        fetchFacilities(),
        fetchPipelines(),
        fetchFields(),
    ]);
    return { facilities, pipelines, fields };
}
