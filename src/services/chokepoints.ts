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
        // Mellom Iran (nord) og Musandam-halvøya i Oman (sør). Cape Musandam ligger
        // ved ~26.47°N — polygonet holder seg nord for dette så det ikke går over land.
        coordinates: [
            [56.10, 26.85],
            [56.65, 26.95],
            [57.15, 26.90],
            [57.35, 26.75],
            [57.25, 26.35],
            [56.80, 26.55],
            [56.35, 26.55],
            [56.10, 26.70],
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
        // Tynn korridor fra Port Said (31.26°N) i nord til Suez (29.97°N) i sør,
        // via Ismailia og Great Bitter Lake langs ~32.3-32.6°E.
        coordinates: [
            [32.28, 31.28],
            [32.32, 31.28],
            [32.34, 30.90],
            [32.36, 30.58],
            [32.42, 30.30],
            [32.60, 29.95],
            [32.55, 29.93],
            [32.38, 30.28],
            [32.30, 30.55],
            [32.28, 30.88],
            [32.26, 31.28],
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
        // Malaysia-halvøya (NØ-side) og Sumatra (SV-side). Polygonet skal ligge
        // mellom kystlinjene, ikke krysse Phuket eller Banda Aceh.
        coordinates: [
            [98.40, 7.90],
            [99.80, 6.40],
            [100.30, 5.40],
            [101.40, 3.00],
            [102.60, 2.00],
            [103.50, 1.35],
            [103.20, 0.70],
            [102.00, 1.30],
            [100.40, 2.30],
            [98.70, 3.60],
            [96.80, 5.00],
            [95.50, 5.70],
            [96.30, 6.80],
            [97.30, 7.60],
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
        // Yemen (NØ) vs Djibouti/Eritrea (SV). Perim-øya ligger sentralt ved ~43.41°E, 12.64°N.
        coordinates: [
            [43.35, 12.85],
            [43.55, 12.70],
            [43.50, 12.40],
            [43.30, 12.20],
            [43.00, 12.20],
            [42.85, 12.40],
            [42.90, 12.65],
            [43.05, 12.80],
        ],
    },
    {
        id: 'bosphorus',
        name: 'Bosporos',
        shortName: 'Bosporos',
        description: 'Eneste sjøvei mellom Svartehavet og Marmarahavet. Kontrolleres av Tyrkia.',
        dailyShips: 48,
        width_km: 0.7,
        // Bosporos-stredet alene — går fra Svartehavet (41.23°N) til Marmarahavet
        // (40.99°N) langs ~29.05°E. Stredet er kun ~700m bredt.
        coordinates: [
            [29.11, 41.25],
            [29.18, 41.20],
            [29.12, 41.05],
            [29.06, 40.99],
            [28.97, 40.99],
            [29.00, 41.10],
            [29.04, 41.22],
        ],
    },
    {
        id: 'dover',
        name: 'Doverstrendet',
        shortName: 'Dover',
        description: 'Smalpunkt mellom England og Frankrike. Verdens mest trafikkerte sjøvei.',
        dailyShips: 500,
        width_km: 33,
        // Mellom South Foreland (UK, 51.14°N, 1.37°E) og Cap Gris-Nez (FR, 50.87°N, 1.59°E).
        coordinates: [
            [1.10, 51.25],
            [1.40, 51.15],
            [1.56, 50.95],
            [1.60, 50.87],
            [1.65, 50.72],
            [1.40, 50.60],
            [1.00, 50.68],
            [0.80, 50.90],
            [0.85, 51.10],
            [1.00, 51.20],
        ],
    },
    {
        id: 'oresund',
        name: 'Øresund',
        shortName: 'Øresund',
        description: 'Mellom Danmark og Sverige. Inngang til Østersjøen.',
        dailyShips: 70,
        width_km: 4,
        // Mellom Helsingør (DK, 12.61°E) og Helsingborg (SE, 12.69°E) i nord,
        // ned til Drogden ved sørenden.
        coordinates: [
            [12.50, 56.12],
            [12.68, 56.08],
            [12.75, 55.90],
            [12.90, 55.60],
            [13.00, 55.45],
            [12.85, 55.28],
            [12.60, 55.28],
            [12.45, 55.50],
            [12.42, 55.75],
            [12.45, 55.95],
        ],
    },
    {
        id: 'luzon',
        name: 'Luzonstredet',
        shortName: 'Luzon',
        description: 'Mellom Filippinene og Taiwan. Kritisk for Stillehavshandel.',
        dailyShips: 30,
        width_km: 250,
        // Mellom Taiwan sørkyst (~21.9°N) og Luzons nordkyst (~18.5°N).
        coordinates: [
            [120.20, 21.80],
            [120.90, 21.95],
            [121.80, 21.60],
            [122.50, 21.00],
            [122.50, 19.50],
            [121.50, 18.60],
            [120.80, 18.50],
            [120.30, 18.70],
            [119.80, 19.50],
            [119.60, 20.50],
            [119.80, 21.30],
        ],
    },
];
