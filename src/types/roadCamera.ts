export interface RoadCamera {
    id: string;
    name: string;
    lat: number;
    lon: number;
    heading?: number; // degrees clockwise from North — undefined if not available
    imageUrl: string;
    road?: string;
}
