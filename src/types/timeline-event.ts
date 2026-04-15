import type { LatLon } from './gate';

export type EntityType = 'flight' | 'ship';

export type CrossingDirection = 'left-to-right' | 'right-to-left';

export interface GateCrossingEvent {
    kind: 'gate-crossing';
    id: string;
    timestamp: number;
    gateId: string;
    entityId: string;
    entityType: EntityType;
    segmentIndex: number;
    direction: CrossingDirection;
    position: LatLon;
}

export interface LayerAlertEvent {
    kind: 'layer-alert';
    id: string;
    timestamp: number;
    layerId: string;
    message: string;
}

export interface DataGapEvent {
    kind: 'data-gap';
    id: string;
    timestamp: number;
    layerId: string;
    fromTs: number;
    toTs: number;
}

export type TimelineEvent = GateCrossingEvent | LayerAlertEvent | DataGapEvent;

export const TIMELINE_EVENT_CAP = 1000;
