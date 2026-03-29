export interface TrafficEvent {
    id: string;
    type: string;
    description: string;
    lat: number;
    lon: number;
    severity: 'low' | 'medium' | 'high';
    startTime: string;
    roadNumber?: string;
}
