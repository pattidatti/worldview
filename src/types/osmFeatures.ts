export interface OsmPoint {
    id: string;
    lat: number;
    lon: number;
    name: string;
    tags: Record<string, string>;
}

export interface OsmWay {
    id: string;
    positions: [number, number][];
    name: string;
    tags: Record<string, string>;
}

export interface PowerData {
    lines: OsmWay[];
    substations: OsmPoint[];
    plants: OsmPoint[];
}

export interface WindData {
    turbines: OsmPoint[];
}

export interface HarborData {
    terminals: OsmPoint[];
    piers: OsmWay[];
}

export interface LighthouseData {
    lighthouses: OsmPoint[];
}

export interface TelecomData {
    towers: OsmPoint[];
}

export interface MineData {
    mines: OsmPoint[];
    quarryCentroids: OsmPoint[];
}
