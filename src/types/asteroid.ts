export interface Asteroid {
    id: string;
    name: string;
    isHazardous: boolean;
    diameterMinM: number;
    diameterMaxM: number;
    closeApproachDate: string;
    missDistanceKm: number;
    relativeVelocityKmh: number;
    nasaUrl: string;
}
