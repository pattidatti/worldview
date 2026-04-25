export type VolcanoAlertLevel = 'normal' | 'advisory' | 'watch' | 'warning' | 'unassigned';

export interface VolcanoEvent {
    id: string;
    name: string;
    lat: number;
    lon: number;
    alertLevel: VolcanoAlertLevel;
    description: string;
    publishedAt: number;
    url: string;
    region?: string;
}
