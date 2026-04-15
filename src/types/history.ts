import type { LayerId } from './layers';

export const HISTORY_SCHEMA_VERSION = 1;

export interface Snapshot {
    ts: number;
    counts: Partial<Record<LayerId, number>>;
}

// Firestore doc-shape i /snapshots/{YYYY-MM-DD_UTC}/entries/{epochMinute}
export interface SnapshotDoc {
    ts: number;
    schemaVersion: number;
    expiresAt: Date;
    counts: Partial<Record<LayerId, number>>;
}
