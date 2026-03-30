export interface Place {
    name: string;
    lat: number;
    lon: number;
    country: string;
    countryCode: string;
    population?: number;
    type: 'capital' | 'city' | 'town';
    wikiSlug?: string;
}

export function countryFlag(code: string): string {
    return [...code.toUpperCase()].map(c =>
        String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)
    ).join('');
}

// Compact format: [name, lat, lon, country, countryCode, population, type, wikiSlug?]
type RawPlace = [string, number, number, string, string, number, 'capital' | 'city' | 'town', string?];

const RAW_PLACES: RawPlace[] = [
    // ── Norge ──
    ['Oslo', 59.91, 10.75, 'Norge', 'NO', 709037, 'capital', 'Oslo'],
    ['Bergen', 60.39, 5.32, 'Norge', 'NO', 289330, 'city', 'Bergen'],
    ['Trondheim', 63.43, 10.40, 'Norge', 'NO', 212660, 'city', 'Trondheim'],
    ['Stavanger', 58.97, 5.73, 'Norge', 'NO', 144147, 'city', 'Stavanger'],
    ['Kristiansand', 58.15, 8.00, 'Norge', 'NO', 114985, 'city', 'Kristiansand'],
    ['Tromsø', 69.65, 18.96, 'Norge', 'NO', 77544, 'city', 'Tromsø'],
    ['Drammen', 59.74, 10.20, 'Norge', 'NO', 101859, 'city', 'Drammen'],
    ['Fredrikstad', 59.22, 10.93, 'Norge', 'NO', 83193, 'city', 'Fredrikstad'],
    ['Sandnes', 58.85, 5.74, 'Norge', 'NO', 81972, 'city'],
    ['Ålesund', 62.47, 6.15, 'Norge', 'NO', 67272, 'city', 'Ålesund'],
    ['Bodø', 67.28, 14.40, 'Norge', 'NO', 53082, 'city', 'Bodø'],
    ['Tønsberg', 59.27, 10.41, 'Norge', 'NO', 57096, 'city', 'Tønsberg'],
    ['Haugesund', 59.41, 5.27, 'Norge', 'NO', 37444, 'town', 'Haugesund'],
    ['Sandefjord', 59.13, 10.22, 'Norge', 'NO', 45928, 'town'],
    ['Molde', 62.74, 7.16, 'Norge', 'NO', 32586, 'town', 'Molde'],
    ['Harstad', 68.80, 16.54, 'Norge', 'NO', 24804, 'town'],
    ['Lillehammer', 61.12, 10.47, 'Norge', 'NO', 28738, 'town', 'Lillehammer'],
    ['Moss', 59.43, 10.66, 'Norge', 'NO', 50290, 'town'],
    ['Gjøvik', 60.80, 10.69, 'Norge', 'NO', 30789, 'town'],
    ['Narvik', 68.43, 17.43, 'Norge', 'NO', 18473, 'town', 'Narvik'],
    ['Alta', 69.97, 23.27, 'Norge', 'NO', 21184, 'town'],
    ['Hammerfest', 70.66, 23.68, 'Norge', 'NO', 10794, 'town', 'Hammerfest'],
    ['Kirkenes', 69.73, 30.05, 'Norge', 'NO', 3529, 'town'],
    ['Larvik', 59.05, 10.03, 'Norge', 'NO', 47710, 'town'],
    ['Skien', 59.21, 9.61, 'Norge', 'NO', 55513, 'town'],
    ['Hamar', 60.79, 11.07, 'Norge', 'NO', 32699, 'town'],
    ['Arendal', 58.46, 8.77, 'Norge', 'NO', 45502, 'town'],
    ['Kongsberg', 59.67, 9.65, 'Norge', 'NO', 28700, 'town'],
    ['Halden', 59.12, 11.39, 'Norge', 'NO', 31444, 'town'],

    // ── Norden ──
    ['Stockholm', 59.33, 18.07, 'Sverige', 'SE', 975904, 'capital', 'Stockholm'],
    ['Göteborg', 57.71, 11.97, 'Sverige', 'SE', 590580, 'city', 'Göteborg'],
    ['Malmö', 55.60, 13.00, 'Sverige', 'SE', 351749, 'city', 'Malmö'],
    ['København', 55.68, 12.57, 'Danmark', 'DK', 644431, 'capital', 'København'],
    ['Helsinki', 60.17, 24.94, 'Finland', 'FI', 658864, 'capital', 'Helsingfors'],
    ['Reykjavik', 64.15, -21.94, 'Island', 'IS', 133262, 'capital', 'Reykjavik'],

    // ── Europa ──
    ['London', 51.51, -0.13, 'Storbritannia', 'GB', 8982000, 'capital', 'London'],
    ['Paris', 48.86, 2.35, 'Frankrike', 'FR', 2161000, 'capital', 'Paris'],
    ['Berlin', 52.52, 13.41, 'Tyskland', 'DE', 3748148, 'capital', 'Berlin'],
    ['Madrid', 40.42, -3.70, 'Spania', 'ES', 3223334, 'capital', 'Madrid'],
    ['Roma', 41.90, 12.50, 'Italia', 'IT', 2873000, 'capital', 'Roma'],
    ['Moskva', 55.76, 37.62, 'Russland', 'RU', 12506468, 'capital', 'Moskva'],
    ['Kyiv', 50.45, 30.52, 'Ukraina', 'UA', 2962180, 'capital', 'Kyiv'],
    ['Warszawa', 52.23, 21.01, 'Polen', 'PL', 1793579, 'capital', 'Warszawa'],
    ['Praha', 50.08, 14.44, 'Tsjekkia', 'CZ', 1309000, 'capital', 'Praha'],
    ['Wien', 48.21, 16.37, 'Østerrike', 'AT', 1911191, 'capital', 'Wien'],
    ['Budapest', 47.50, 19.04, 'Ungarn', 'HU', 1752286, 'capital', 'Budapest'],
    ['Bucuresti', 44.43, 26.10, 'Romania', 'RO', 1883425, 'capital', 'Bucuresti'],
    ['Aten', 37.98, 23.73, 'Hellas', 'GR', 664046, 'capital', 'Aten'],
    ['Lisboa', 38.72, -9.14, 'Portugal', 'PT', 544851, 'capital', 'Lisboa'],
    ['Dublin', 53.35, -6.26, 'Irland', 'IE', 544107, 'capital', 'Dublin'],
    ['Brussel', 50.85, 4.35, 'Belgia', 'BE', 185103, 'capital', 'Brussel'],
    ['Amsterdam', 52.37, 4.90, 'Nederland', 'NL', 872680, 'capital', 'Amsterdam'],
    ['Bern', 46.95, 7.45, 'Sveits', 'CH', 133883, 'capital', 'Bern'],
    ['Zürich', 47.37, 8.54, 'Sveits', 'CH', 421878, 'city', 'Zürich'],
    ['Barcelona', 41.39, 2.17, 'Spania', 'ES', 1621000, 'city', 'Barcelona'],
    ['Milano', 45.46, 9.19, 'Italia', 'IT', 1396059, 'city', 'Milano'],
    ['München', 48.14, 11.58, 'Tyskland', 'DE', 1484226, 'city', 'München'],
    ['Hamburg', 53.55, 9.99, 'Tyskland', 'DE', 1841179, 'city', 'Hamburg'],
    ['Istanbul', 41.01, 28.98, 'Tyrkia', 'TR', 15462452, 'city', 'Istanbul'],
    ['Ankara', 39.93, 32.86, 'Tyrkia', 'TR', 5663322, 'capital', 'Ankara'],
    ['Belgrad', 44.79, 20.47, 'Serbia', 'RS', 1166763, 'capital', 'Beograd'],
    ['Sofia', 42.70, 23.32, 'Bulgaria', 'BG', 1307439, 'capital', 'Sofia'],
    ['Zagreb', 45.81, 15.98, 'Kroatia', 'HR', 806341, 'capital', 'Zagreb'],
    ['Bratislava', 48.15, 17.11, 'Slovakia', 'SK', 475503, 'capital', 'Bratislava'],
    ['Vilnius', 54.69, 25.28, 'Litauen', 'LT', 592389, 'capital', 'Vilnius'],
    ['Riga', 56.95, 24.11, 'Latvia', 'LV', 614618, 'capital', 'Riga'],
    ['Tallinn', 59.44, 24.75, 'Estland', 'EE', 444532, 'capital', 'Tallinn'],
    ['Edinburgh', 55.95, -3.19, 'Storbritannia', 'GB', 488050, 'city', 'Edinburgh'],
    ['Manchester', 53.48, -2.24, 'Storbritannia', 'GB', 553230, 'city', 'Manchester'],
    ['Marseille', 43.30, 5.37, 'Frankrike', 'FR', 870018, 'city', 'Marseille'],
    ['Sankt Petersburg', 59.93, 30.32, 'Russland', 'RU', 5384342, 'city', 'Sankt Petersburg'],
    ['Minsk', 53.90, 27.57, 'Hviterussland', 'BY', 1996553, 'capital', 'Minsk'],

    // ── Nord-Amerika ──
    ['Washington D.C.', 38.91, -77.04, 'USA', 'US', 689545, 'capital', 'Washington, D.C.'],
    ['New York', 40.71, -74.01, 'USA', 'US', 8336817, 'city', 'New York'],
    ['Los Angeles', 34.05, -118.24, 'USA', 'US', 3979576, 'city', 'Los Angeles'],
    ['Chicago', 41.88, -87.63, 'USA', 'US', 2693976, 'city', 'Chicago'],
    ['San Francisco', 37.77, -122.42, 'USA', 'US', 873965, 'city', 'San Francisco'],
    ['Miami', 25.76, -80.19, 'USA', 'US', 449514, 'city', 'Miami'],
    ['Houston', 29.76, -95.37, 'USA', 'US', 2304580, 'city', 'Houston'],
    ['Ottawa', 45.42, -75.70, 'Canada', 'CA', 1017449, 'capital', 'Ottawa'],
    ['Toronto', 43.65, -79.38, 'Canada', 'CA', 2794356, 'city', 'Toronto'],
    ['Vancouver', 49.28, -123.12, 'Canada', 'CA', 662248, 'city', 'Vancouver'],
    ['Ciudad de México', 19.43, -99.13, 'Mexico', 'MX', 9209944, 'capital', 'Mexico by'],
    ['Havanna', 23.11, -82.37, 'Cuba', 'CU', 2130081, 'capital', 'Havanna'],

    // ── Sør-Amerika ──
    ['Brasília', -15.79, -47.88, 'Brasil', 'BR', 3094325, 'capital', 'Brasília'],
    ['São Paulo', -23.55, -46.63, 'Brasil', 'BR', 12325232, 'city', 'São Paulo'],
    ['Rio de Janeiro', -22.91, -43.17, 'Brasil', 'BR', 6748000, 'city', 'Rio de Janeiro'],
    ['Buenos Aires', -34.60, -58.38, 'Argentina', 'AR', 2891082, 'capital', 'Buenos Aires'],
    ['Lima', -12.05, -77.04, 'Peru', 'PE', 9751717, 'capital', 'Lima'],
    ['Santiago', -33.45, -70.67, 'Chile', 'CL', 6160040, 'capital', 'Santiago de Chile'],
    ['Bogotá', 4.71, -74.07, 'Colombia', 'CO', 7181469, 'capital', 'Bogotá'],

    // ── Afrika ──
    ['Kairo', 30.04, 31.24, 'Egypt', 'EG', 10025657, 'capital', 'Kairo'],
    ['Lagos', 6.52, 3.38, 'Nigeria', 'NG', 15388000, 'city', 'Lagos'],
    ['Abuja', 9.06, 7.49, 'Nigeria', 'NG', 3464123, 'capital', 'Abuja'],
    ['Nairobi', -1.29, 36.82, 'Kenya', 'KE', 4397073, 'capital', 'Nairobi'],
    ['Johannesburg', -26.20, 28.05, 'Sør-Afrika', 'ZA', 5635127, 'city', 'Johannesburg'],
    ['Cape Town', -33.93, 18.42, 'Sør-Afrika', 'ZA', 4618000, 'city', 'Cape Town'],
    ['Pretoria', -25.75, 28.19, 'Sør-Afrika', 'ZA', 2473000, 'capital', 'Pretoria'],
    ['Casablanca', 33.57, -7.59, 'Marokko', 'MA', 3752357, 'city', 'Casablanca'],
    ['Addis Abeba', 9.03, 38.75, 'Etiopia', 'ET', 3352000, 'capital', 'Addis Abeba'],
    ['Kinshasa', -4.32, 15.31, 'DR Kongo', 'CD', 14970000, 'capital', 'Kinshasa'],
    ['Accra', 5.56, -0.19, 'Ghana', 'GH', 2291352, 'capital', 'Accra'],
    ['Dakar', 14.69, -17.44, 'Senegal', 'SN', 1146053, 'capital', 'Dakar'],
    ['Algier', 36.75, 3.06, 'Algerie', 'DZ', 3415811, 'capital', 'Alger'],

    // ── Asia ──
    ['Beijing', 39.90, 116.40, 'Kina', 'CN', 21542000, 'capital', 'Beijing'],
    ['Shanghai', 31.23, 121.47, 'Kina', 'CN', 24870895, 'city', 'Shanghai'],
    ['Hong Kong', 22.32, 114.17, 'Kina', 'HK', 7482500, 'city', 'Hongkong'],
    ['Guangzhou', 23.13, 113.26, 'Kina', 'CN', 18676605, 'city', 'Guangzhou'],
    ['Tokyo', 35.68, 139.69, 'Japan', 'JP', 13960000, 'capital', 'Tokyo'],
    ['Osaka', 34.69, 135.50, 'Japan', 'JP', 2753862, 'city', 'Osaka'],
    ['Seoul', 37.57, 126.98, 'Sør-Korea', 'KR', 9776000, 'capital', 'Seoul'],
    ['New Delhi', 28.61, 77.21, 'India', 'IN', 16787941, 'capital', 'New Delhi'],
    ['Mumbai', 19.08, 72.88, 'India', 'IN', 12478447, 'city', 'Mumbai'],
    ['Kolkata', 22.57, 88.36, 'India', 'IN', 4496694, 'city', 'Kolkata'],
    ['Bangkok', 13.76, 100.50, 'Thailand', 'TH', 10539415, 'capital', 'Bangkok'],
    ['Jakarta', -6.21, 106.85, 'Indonesia', 'ID', 10562088, 'capital', 'Jakarta'],
    ['Singapore', 1.35, 103.82, 'Singapore', 'SG', 5850342, 'capital', 'Singapore'],
    ['Kuala Lumpur', 3.14, 101.69, 'Malaysia', 'MY', 1982112, 'capital', 'Kuala Lumpur'],
    ['Manila', 14.60, 120.98, 'Filippinene', 'PH', 1846513, 'capital', 'Manila'],
    ['Hanoi', 21.03, 105.85, 'Vietnam', 'VN', 8053663, 'capital', 'Hanoi'],
    ['Ho Chi Minh-byen', 10.82, 106.63, 'Vietnam', 'VN', 8993082, 'city', 'Ho Chi Minh-byen'],
    ['Teheran', 35.69, 51.39, 'Iran', 'IR', 8693706, 'capital', 'Teheran'],
    ['Riyadh', 24.69, 46.72, 'Saudi-Arabia', 'SA', 7676654, 'capital', 'Riyadh'],
    ['Dubai', 25.20, 55.27, 'UAE', 'AE', 3478300, 'city', 'Dubai'],
    ['Baghdad', 33.31, 44.37, 'Irak', 'IQ', 8126755, 'capital', 'Bagdad'],
    ['Islamabad', 33.69, 73.04, 'Pakistan', 'PK', 1095064, 'capital', 'Islamabad'],
    ['Karachi', 24.86, 67.01, 'Pakistan', 'PK', 14910352, 'city', 'Karachi'],
    ['Dhaka', 23.81, 90.41, 'Bangladesh', 'BD', 8906039, 'capital', 'Dhaka'],
    ['Kabul', 34.53, 69.17, 'Afghanistan', 'AF', 4601789, 'capital', 'Kabul'],

    // ── Oseania ──
    ['Canberra', -35.28, 149.13, 'Australia', 'AU', 462213, 'capital', 'Canberra'],
    ['Sydney', -33.87, 151.21, 'Australia', 'AU', 5367206, 'city', 'Sydney'],
    ['Melbourne', -37.81, 144.96, 'Australia', 'AU', 5078193, 'city', 'Melbourne'],
    ['Wellington', -41.29, 174.78, 'New Zealand', 'NZ', 215400, 'capital', 'Wellington'],
    ['Auckland', -36.85, 174.76, 'New Zealand', 'NZ', 1657200, 'city', 'Auckland'],
];

export const PLACES: Place[] = RAW_PLACES.map(([name, lat, lon, country, countryCode, population, type, wikiSlug]) => ({
    name, lat, lon, country, countryCode, population, type, wikiSlug,
}));
