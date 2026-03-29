export interface Facility {
    id: string;
    name: string;
    kind: string;
    phase: string;
    functions: string;
    fixedOrMoveable: string;
    operator: string;
    belongsTo: string;
    waterDepth: number;
    startupDate: string | null;
    lat: number;
    lon: number;
}

export interface Pipeline {
    id: string;
    name: string;
    medium: string;
    dimension: number;
    operator: string;
    fromFacility: string;
    toFacility: string;
    phase: string;
    belongsTo: string;
    waterDepth: number;
    paths: number[][][];
}

export interface Field {
    id: string;
    name: string;
    status: string;
    operator: string;
    hcType: string;
    discoveryYear: number;
    mainArea: string;
    rings: number[][][];
}

export interface InfrastructureData {
    facilities: Facility[];
    pipelines: Pipeline[];
    fields: Field[];
}

// Overpass (OSM) types — global data
export interface OverpassPipeline {
    id: string;
    name: string;
    substance: string;
    operator: string;
    positions: [number, number][];  // [lon, lat][]
}

export interface OverpassPlatform {
    id: string;
    name: string;
    operator: string;
    lat: number;
    lon: number;
}

export interface OverpassWell {
    id: string;
    name: string;
    operator: string;
    lat: number;
    lon: number;
}

export interface OverpassInfrastructureData {
    pipelines: OverpassPipeline[];
    platforms: OverpassPlatform[];
    wells: OverpassWell[];
}
