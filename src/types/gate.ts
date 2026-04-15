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
    ownerUid?: string;
    schemaVersion?: number;
}

export const GATE_SCHEMA_VERSION = 1;

// Firestore doc-shape (ingen visible — den er per-bruker i localStorage).
export interface GateRemote {
    name: string;
    vertices: LatLon[];
    color: string;
    createdAt: number;
    ownerUid: string;
    schemaVersion: number;
}

export interface GateStorage {
    version: number;
    gates: Gate[];
}
