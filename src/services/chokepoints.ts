export interface Chokepoint {
    id: string;
    name: string;
    shortName: string;
    description: string;
    dailyShips: number;       // gjennomsnittlig daglig skipstrafikk
    oilPercent?: number;      // andel av global oljehandel (%)
    width_km: number;         // smaleste punkt i km
    coordinates: [number, number][]; // [lon, lat] polygon
}

export const CHOKEPOINTS: Chokepoint[] = [
    {
        id: 'hormuz',
        name: 'Hormuzstredet',
        shortName: 'Hormuz',
        description: 'Smalpunkt mellom Iran og Oman. Kontrollerer 20% av verdens oljehandel.',
        dailyShips: 130,
        oilPercent: 20,
        width_km: 39,
        coordinates: [
            [55.8, 26.7], [56.2, 26.5], [56.7, 26.3], [57.1, 26.1],
            [57.4, 25.9], [57.2, 25.5], [56.8, 25.4], [56.3, 25.6],
            [55.9, 25.8], [55.6, 26.1], [55.5, 26.4], [55.8, 26.7],
        ],
    },
    {
        id: 'suez',
        name: 'Suezkanalen',
        shortName: 'Suez',
        description: 'Forbinder Middelhavet med Rødehavet. 12% av global skipstrafikk.',
        dailyShips: 50,
        oilPercent: 9,
        width_km: 0.3,
        coordinates: [
            [32.33, 30.75], [32.35, 30.5], [32.37, 30.2], [32.38, 29.9],
            [32.40, 29.6], [32.55, 29.4], [32.57, 29.1], [32.5, 28.8],
            [32.45, 28.5], [32.40, 28.3], [32.35, 28.3],
            [32.3, 28.5], [32.28, 28.8], [32.25, 29.1],
            [32.2, 29.4], [32.25, 29.6], [32.27, 29.9],
            [32.28, 30.2], [32.30, 30.5], [32.33, 30.75],
        ],
    },
    {
        id: 'malacca',
        name: 'Malakkastredet',
        shortName: 'Malacca',
        description: 'Mellom Malaysia og Indonesia. Mest trafikkerte handelsrute i Asia.',
        dailyShips: 85,
        oilPercent: 16,
        width_km: 65,
        coordinates: [
            [99.0, 6.5], [99.8, 6.2], [100.5, 5.8], [101.2, 5.2],
            [102.0, 4.5], [102.8, 3.8], [103.5, 3.2], [103.8, 2.5],
            [103.5, 2.2], [102.8, 2.5], [102.0, 3.1], [101.2, 3.8],
            [100.4, 4.5], [99.7, 5.2], [99.2, 5.8], [99.0, 6.5],
        ],
    },
    {
        id: 'bab-el-mandeb',
        name: 'Bab-el-Mandeb',
        shortName: 'Bab-el-Mandeb',
        description: 'Inngang til Rødehavet fra Adenbukten. Kritisk for Suezruten.',
        dailyShips: 50,
        oilPercent: 7,
        width_km: 29,
        coordinates: [
            [43.2, 12.8], [43.5, 12.6], [43.7, 12.4], [43.8, 12.1],
            [43.6, 11.9], [43.3, 11.8], [43.0, 11.9], [42.8, 12.1],
            [42.9, 12.4], [43.1, 12.6], [43.2, 12.8],
        ],
    },
    {
        id: 'bosphorus',
        name: 'Bosporos og Dardanellene',
        shortName: 'Bosporos',
        description: 'Eneste sjøvei mellom Svartehavet og Middelhavet. Kontrolleres av Tyrkia.',
        dailyShips: 48,
        width_km: 0.7,
        coordinates: [
            [28.9, 41.3], [28.95, 41.1], [29.0, 40.9], [29.05, 40.7],
            [29.1, 40.5], [28.9, 40.3], [26.8, 40.1], [26.5, 40.0],
            [26.3, 40.1], [26.1, 40.2], [26.2, 40.4], [26.5, 40.5],
            [27.0, 40.7], [28.5, 41.0], [28.8, 41.2], [28.9, 41.3],
        ],
    },
    {
        id: 'dover',
        name: 'Doverstrendet',
        shortName: 'Dover',
        description: 'Smalpunkt mellom England og Frankrike. Verdens mest trafikkerte sjøvei.',
        dailyShips: 500,
        width_km: 33,
        coordinates: [
            [1.2, 51.4], [1.5, 51.3], [1.8, 51.1], [1.9, 50.9],
            [1.7, 50.7], [1.4, 50.6], [1.1, 50.6],
            [0.9, 50.8], [0.9, 51.1], [1.0, 51.3], [1.2, 51.4],
        ],
    },
    {
        id: 'oresund',
        name: 'Øresund',
        shortName: 'Øresund',
        description: 'Mellom Danmark og Sverige. Inngang til Østersjøen.',
        dailyShips: 70,
        width_km: 4,
        coordinates: [
            [12.5, 56.1], [12.6, 56.0], [12.65, 55.8], [12.65, 55.6],
            [12.6, 55.4], [12.5, 55.3], [12.4, 55.3],
            [12.35, 55.5], [12.35, 55.8], [12.4, 56.0], [12.5, 56.1],
        ],
    },
    {
        id: 'luzon',
        name: 'Luzonstredet',
        shortName: 'Luzon',
        description: 'Mellom Filippinene og Taiwan. Kritisk for Stillehavshandel.',
        dailyShips: 30,
        width_km: 250,
        coordinates: [
            [119.5, 22.0], [120.5, 21.5], [121.5, 21.0], [122.5, 20.5],
            [122.0, 19.5], [121.0, 19.0], [120.0, 19.5],
            [119.5, 20.0], [119.0, 20.5], [119.0, 21.0], [119.5, 22.0],
        ],
    },
];
