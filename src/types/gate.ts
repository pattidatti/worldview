export interface LatLon {
    lat: number;
    lon: number;
}

export interface Gate {
    id: string;
    name: string;
    vertices: LatLon[];
    color: string;
    visible: boolean;
    createdAt: number;
}

export const GATE_SCHEMA_VERSION = 1;

export interface GateStorage {
    version: number;
    gates: Gate[];
}
