export interface GeoNavItem {
    id: string;
    name: string;
    lat: number;
    lon: number;
    altitude: number;
    countryCode?: string;
    region?: string;
}

export const WORLD_REGIONS: GeoNavItem[] = [
    { id: 'europa',       name: 'Europa',       lat: 54.5,  lon: 15.2,   altitude: 5_000_000 },
    { id: 'asia',         name: 'Asia',         lat: 34.0,  lon: 100.6,  altitude: 8_000_000 },
    { id: 'nord-amerika', name: 'Nord-Amerika',  lat: 54.5,  lon: -105.3, altitude: 7_000_000 },
    { id: 'sor-amerika',  name: 'Sør-Amerika',   lat: -15.6, lon: -56.1,  altitude: 6_000_000 },
    { id: 'afrika',       name: 'Afrika',        lat: 4.2,   lon: 21.1,   altitude: 6_000_000 },
    { id: 'oseania',      name: 'Oseania',       lat: -22.7, lon: 140.0,  altitude: 6_000_000 },
    { id: 'midtost',      name: 'Midtøsten',    lat: 27.0,  lon: 43.0,   altitude: 4_000_000 },
];

export const COUNTRIES: (GeoNavItem & { countryCode: string; region: string })[] = [
    // Europa
    { id: 'NO', name: 'Norge',          lat: 60.5,   lon: 8.5,    altitude: 1_500_000, countryCode: 'no', region: 'europa' },
    { id: 'SE', name: 'Sverige',        lat: 62.0,   lon: 15.0,   altitude: 1_500_000, countryCode: 'se', region: 'europa' },
    { id: 'DK', name: 'Danmark',        lat: 56.3,   lon: 9.5,    altitude: 700_000,   countryCode: 'dk', region: 'europa' },
    { id: 'FI', name: 'Finland',        lat: 61.9,   lon: 25.7,   altitude: 1_500_000, countryCode: 'fi', region: 'europa' },
    { id: 'IS', name: 'Island',         lat: 64.9,   lon: -18.5,  altitude: 900_000,   countryCode: 'is', region: 'europa' },
    { id: 'GB', name: 'Storbritannia',  lat: 52.4,   lon: -1.2,   altitude: 1_200_000, countryCode: 'gb', region: 'europa' },
    { id: 'DE', name: 'Tyskland',       lat: 51.2,   lon: 10.5,   altitude: 1_200_000, countryCode: 'de', region: 'europa' },
    { id: 'FR', name: 'Frankrike',      lat: 46.2,   lon: 2.2,    altitude: 1_200_000, countryCode: 'fr', region: 'europa' },
    { id: 'ES', name: 'Spania',         lat: 40.0,   lon: -3.7,   altitude: 1_200_000, countryCode: 'es', region: 'europa' },
    { id: 'IT', name: 'Italia',         lat: 41.9,   lon: 12.6,   altitude: 1_200_000, countryCode: 'it', region: 'europa' },
    { id: 'PL', name: 'Polen',          lat: 51.9,   lon: 19.1,   altitude: 1_000_000, countryCode: 'pl', region: 'europa' },
    { id: 'NL', name: 'Nederland',      lat: 52.3,   lon: 5.3,    altitude: 600_000,   countryCode: 'nl', region: 'europa' },
    { id: 'BE', name: 'Belgia',         lat: 50.5,   lon: 4.5,    altitude: 500_000,   countryCode: 'be', region: 'europa' },
    { id: 'CH', name: 'Sveits',         lat: 46.8,   lon: 8.2,    altitude: 500_000,   countryCode: 'ch', region: 'europa' },
    { id: 'AT', name: 'Østerrike',      lat: 47.5,   lon: 14.6,   altitude: 500_000,   countryCode: 'at', region: 'europa' },
    { id: 'PT', name: 'Portugal',       lat: 39.4,   lon: -8.2,   altitude: 700_000,   countryCode: 'pt', region: 'europa' },
    { id: 'GR', name: 'Hellas',         lat: 39.1,   lon: 21.8,   altitude: 700_000,   countryCode: 'gr', region: 'europa' },
    { id: 'UA', name: 'Ukraina',        lat: 49.0,   lon: 31.4,   altitude: 1_200_000, countryCode: 'ua', region: 'europa' },
    { id: 'RU', name: 'Russland',       lat: 61.5,   lon: 90.0,   altitude: 8_000_000, countryCode: 'ru', region: 'europa' },
    { id: 'CZ', name: 'Tsjekkia',       lat: 49.8,   lon: 15.5,   altitude: 500_000,   countryCode: 'cz', region: 'europa' },
    { id: 'HU', name: 'Ungarn',         lat: 47.2,   lon: 19.5,   altitude: 500_000,   countryCode: 'hu', region: 'europa' },
    { id: 'RO', name: 'Romania',        lat: 45.9,   lon: 24.9,   altitude: 700_000,   countryCode: 'ro', region: 'europa' },
    { id: 'HR', name: 'Kroatia',        lat: 45.1,   lon: 15.2,   altitude: 500_000,   countryCode: 'hr', region: 'europa' },

    // Asia
    { id: 'CN', name: 'Kina',           lat: 35.9,   lon: 104.2,  altitude: 6_000_000, countryCode: 'cn', region: 'asia' },
    { id: 'JP', name: 'Japan',          lat: 36.2,   lon: 138.3,  altitude: 1_500_000, countryCode: 'jp', region: 'asia' },
    { id: 'IN', name: 'India',          lat: 20.6,   lon: 78.9,   altitude: 4_000_000, countryCode: 'in', region: 'asia' },
    { id: 'KR', name: 'Sør-Korea',      lat: 36.0,   lon: 128.0,  altitude: 700_000,   countryCode: 'kr', region: 'asia' },
    { id: 'ID', name: 'Indonesia',      lat: -2.5,   lon: 118.0,  altitude: 4_000_000, countryCode: 'id', region: 'asia' },
    { id: 'TH', name: 'Thailand',       lat: 15.9,   lon: 100.9,  altitude: 1_200_000, countryCode: 'th', region: 'asia' },
    { id: 'VN', name: 'Vietnam',        lat: 14.1,   lon: 108.3,  altitude: 1_000_000, countryCode: 'vn', region: 'asia' },
    { id: 'MY', name: 'Malaysia',       lat: 4.2,    lon: 108.0,  altitude: 1_200_000, countryCode: 'my', region: 'asia' },
    { id: 'PK', name: 'Pakistan',       lat: 30.4,   lon: 69.3,   altitude: 2_000_000, countryCode: 'pk', region: 'asia' },
    { id: 'BD', name: 'Bangladesh',     lat: 23.7,   lon: 90.4,   altitude: 500_000,   countryCode: 'bd', region: 'asia' },
    { id: 'PH', name: 'Filippinene',    lat: 12.9,   lon: 121.8,  altitude: 1_500_000, countryCode: 'ph', region: 'asia' },
    { id: 'KZ', name: 'Kasakhstan',     lat: 48.0,   lon: 68.0,   altitude: 3_000_000, countryCode: 'kz', region: 'asia' },
    { id: 'UZ', name: 'Usbekistan',     lat: 41.4,   lon: 64.6,   altitude: 1_500_000, countryCode: 'uz', region: 'asia' },
    { id: 'SG', name: 'Singapore',      lat: 1.35,   lon: 103.8,  altitude: 100_000,   countryCode: 'sg', region: 'asia' },

    // Midtøsten
    { id: 'SA', name: 'Saudi-Arabia',   lat: 23.9,   lon: 45.1,   altitude: 2_000_000, countryCode: 'sa', region: 'midtost' },
    { id: 'IR', name: 'Iran',           lat: 32.4,   lon: 53.7,   altitude: 2_000_000, countryCode: 'ir', region: 'midtost' },
    { id: 'TR', name: 'Tyrkia',         lat: 38.9,   lon: 35.2,   altitude: 1_500_000, countryCode: 'tr', region: 'midtost' },
    { id: 'AE', name: 'De forente arabiske emirater', lat: 23.4, lon: 53.8, altitude: 400_000, countryCode: 'ae', region: 'midtost' },
    { id: 'IL', name: 'Israel',         lat: 31.5,   lon: 34.8,   altitude: 300_000,   countryCode: 'il', region: 'midtost' },
    { id: 'IQ', name: 'Irak',           lat: 33.2,   lon: 43.7,   altitude: 1_000_000, countryCode: 'iq', region: 'midtost' },
    { id: 'SY', name: 'Syria',          lat: 34.8,   lon: 38.9,   altitude: 600_000,   countryCode: 'sy', region: 'midtost' },
    { id: 'YE', name: 'Jemen',          lat: 15.6,   lon: 48.5,   altitude: 800_000,   countryCode: 'ye', region: 'midtost' },

    // Afrika
    { id: 'NG', name: 'Nigeria',        lat: 9.1,    lon: 8.7,    altitude: 2_000_000, countryCode: 'ng', region: 'afrika' },
    { id: 'ET', name: 'Etiopia',        lat: 9.1,    lon: 40.5,   altitude: 1_500_000, countryCode: 'et', region: 'afrika' },
    { id: 'EG', name: 'Egypt',          lat: 26.8,   lon: 30.8,   altitude: 1_500_000, countryCode: 'eg', region: 'afrika' },
    { id: 'CD', name: 'DR Kongo',       lat: -4.0,   lon: 21.8,   altitude: 2_500_000, countryCode: 'cd', region: 'afrika' },
    { id: 'TZ', name: 'Tanzania',       lat: -6.4,   lon: 34.9,   altitude: 1_500_000, countryCode: 'tz', region: 'afrika' },
    { id: 'ZA', name: 'Sør-Afrika',     lat: -28.5,  lon: 24.7,   altitude: 2_000_000, countryCode: 'za', region: 'afrika' },
    { id: 'KE', name: 'Kenya',          lat: -0.0,   lon: 37.9,   altitude: 1_000_000, countryCode: 'ke', region: 'afrika' },
    { id: 'MA', name: 'Marokko',        lat: 31.8,   lon: -7.1,   altitude: 1_000_000, countryCode: 'ma', region: 'afrika' },
    { id: 'GH', name: 'Ghana',          lat: 7.9,    lon: -1.0,   altitude: 700_000,   countryCode: 'gh', region: 'afrika' },
    { id: 'CI', name: 'Elfenbenskysten',lat: 7.5,    lon: -5.6,   altitude: 700_000,   countryCode: 'ci', region: 'afrika' },

    // Nord-Amerika
    { id: 'US', name: 'USA',            lat: 37.1,   lon: -95.7,  altitude: 6_000_000, countryCode: 'us', region: 'nord-amerika' },
    { id: 'CA', name: 'Canada',         lat: 56.1,   lon: -106.3, altitude: 6_000_000, countryCode: 'ca', region: 'nord-amerika' },
    { id: 'MX', name: 'Mexico',         lat: 23.6,   lon: -102.6, altitude: 2_500_000, countryCode: 'mx', region: 'nord-amerika' },
    { id: 'CU', name: 'Cuba',           lat: 21.5,   lon: -79.5,  altitude: 600_000,   countryCode: 'cu', region: 'nord-amerika' },
    { id: 'GT', name: 'Guatemala',      lat: 15.8,   lon: -90.2,  altitude: 500_000,   countryCode: 'gt', region: 'nord-amerika' },

    // Sør-Amerika
    { id: 'BR', name: 'Brasil',         lat: -14.2,  lon: -51.9,  altitude: 6_000_000, countryCode: 'br', region: 'sor-amerika' },
    { id: 'AR', name: 'Argentina',      lat: -38.4,  lon: -63.6,  altitude: 3_500_000, countryCode: 'ar', region: 'sor-amerika' },
    { id: 'CO', name: 'Colombia',       lat: 4.6,    lon: -74.3,  altitude: 1_500_000, countryCode: 'co', region: 'sor-amerika' },
    { id: 'CL', name: 'Chile',          lat: -35.7,  lon: -71.5,  altitude: 2_000_000, countryCode: 'cl', region: 'sor-amerika' },
    { id: 'PE', name: 'Peru',           lat: -9.2,   lon: -75.0,  altitude: 1_500_000, countryCode: 'pe', region: 'sor-amerika' },
    { id: 'VE', name: 'Venezuela',      lat: 6.4,    lon: -66.6,  altitude: 1_200_000, countryCode: 've', region: 'sor-amerika' },
    { id: 'EC', name: 'Ecuador',        lat: -1.8,   lon: -78.2,  altitude: 700_000,   countryCode: 'ec', region: 'sor-amerika' },
    { id: 'BO', name: 'Bolivia',        lat: -16.3,  lon: -63.6,  altitude: 1_000_000, countryCode: 'bo', region: 'sor-amerika' },

    // Oseania
    { id: 'AU', name: 'Australia',      lat: -25.3,  lon: 133.8,  altitude: 6_000_000, countryCode: 'au', region: 'oseania' },
    { id: 'NZ', name: 'New Zealand',    lat: -40.9,  lon: 174.9,  altitude: 1_500_000, countryCode: 'nz', region: 'oseania' },
    { id: 'PG', name: 'Papua Ny-Guinea',lat: -6.3,   lon: 143.9,  altitude: 1_200_000, countryCode: 'pg', region: 'oseania' },
    { id: 'FJ', name: 'Fiji',           lat: -16.6,  lon: 179.4,  altitude: 400_000,   countryCode: 'fj', region: 'oseania' },
];
