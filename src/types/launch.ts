export interface RocketLaunch {
    id: string;
    name: string;
    provider: string;
    lat: number;
    lon: number;
    net: string;
    statusName: string;
    imageUrl?: string;
    infoUrl?: string;
    padName: string;
    missionDescription?: string;
    rocketName?: string;
}
