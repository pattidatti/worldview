import type { HeritageSite } from '@/types/heritage';

/**
 * Verdens-arv-samlinger med statisk kuratert innhold.
 * Hver samling har monumenter (3D-geometri + fakta) og en cinematic tour.
 *
 * Koordinater er WGS84. Pyramidedimensjoner følger arkeologiske kilder.
 * Glow-farger er valgt så de tre Giza-pyramidene er lett å skille på avstand.
 */
export const HERITAGE_SITES: HeritageSite[] = [
    {
        id: 'giza',
        name: 'Giza-platået',
        center: { lon: 31.1325, lat: 29.9762 },
        monuments: [
            {
                id: 'khufu',
                siteId: 'giza',
                name: 'Khufus pyramide',
                kind: 'pyramid',
                center: { lon: 31.1342, lat: 29.9792 },
                baseSizeM: 230.4,
                heightM: 138.5,
                glowColor: '#FFD700', // gull
                groundElevationM: 60,
                summary: 'Den store pyramiden — bygget for farao Khufu rundt 2560 f.Kr. og det eneste gjenværende av antikkens syv underverker.',
                wowFact: 'Bygd av ~2.3 millioner steinblokker, hver i snitt 2.5 tonn.',
                facts: [
                    { label: 'Byggherre', value: 'Khufu (Cheops)' },
                    { label: 'Bygd', value: '~2560 f.Kr.' },
                    { label: 'Høyde', value: '138.5', unit: 'm' },
                    { label: 'Opprinnelig', value: '146.6', unit: 'm' },
                    { label: 'Sidelengde', value: '230.4', unit: 'm' },
                    { label: 'Materiale', value: 'Kalkstein + granitt' },
                ],
                imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Kheops-Pyramid.jpg/640px-Kheops-Pyramid.jpg',
                wikipediaUrl: 'https://no.wikipedia.org/wiki/Kheops%27_pyramide',
                wikipediaTitle: 'Kheops_pyramide',
            },
            {
                id: 'khafre',
                siteId: 'giza',
                name: 'Khafres pyramide',
                kind: 'pyramid',
                center: { lon: 31.1308, lat: 29.9761 },
                baseSizeM: 215.5,
                heightM: 136.4,
                glowColor: '#FFA500', // rav
                groundElevationM: 70,
                summary: 'Den nest største — sønnen Khafres pyramide. Beholder fortsatt rester av den polerte kalksteinstoppen.',
                wowFact: 'Står på høyere grunn enn Khufu og virker derfor høyere selv om den er lavere.',
                facts: [
                    { label: 'Byggherre', value: 'Khafre' },
                    { label: 'Bygd', value: '~2530 f.Kr.' },
                    { label: 'Høyde', value: '136.4', unit: 'm' },
                    { label: 'Sidelengde', value: '215.5', unit: 'm' },
                    { label: 'Topp', value: 'Polert Tura-kalkstein' },
                ],
                imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Pyramide_Kephren.jpg/640px-Pyramide_Kephren.jpg',
                wikipediaUrl: 'https://no.wikipedia.org/wiki/Khafres_pyramide',
                wikipediaTitle: 'Khafres_pyramide',
            },
            {
                id: 'menkaure',
                siteId: 'giza',
                name: 'Menkaures pyramide',
                kind: 'pyramid',
                center: { lon: 31.1278, lat: 29.9724 },
                baseSizeM: 108.5,
                heightM: 65.5,
                glowColor: '#CD7F32', // kobber
                groundElevationM: 75,
                summary: 'Den minste av de tre — barnebarnet Menkaures pyramide. Hadde rød granitt på de nederste 16 lagene.',
                wowFact: 'Et stort krater i nordsiden er en mislykket rivnings-forsøk fra 1196 e.Kr.',
                facts: [
                    { label: 'Byggherre', value: 'Menkaure' },
                    { label: 'Bygd', value: '~2510 f.Kr.' },
                    { label: 'Høyde', value: '65.5', unit: 'm' },
                    { label: 'Sidelengde', value: '108.5', unit: 'm' },
                    { label: 'Base', value: 'Rød granitt' },
                ],
                imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/All_Gizah_Pyramids-3.jpg/640px-All_Gizah_Pyramids-3.jpg',
                wikipediaUrl: 'https://no.wikipedia.org/wiki/Menkaures_pyramide',
                wikipediaTitle: 'Menkaures_pyramide',
            },
            {
                id: 'sphinx',
                siteId: 'giza',
                name: 'Den store sfinxen',
                kind: 'sphinx',
                center: { lon: 31.1376, lat: 29.9753 },
                baseSizeM: 19,
                heightM: 20,
                glowColor: '#E5C07B', // sand
                groundElevationM: 60,
                summary: 'Hugget ut av én eneste kalksteinblokk — vokter Khafres pyramide og ser mot soloppgangen i øst.',
                wowFact: 'Nesa forsvant for over 600 år siden — ingen vet sikkert hvordan.',
                facts: [
                    { label: 'Bygd', value: '~2500 f.Kr.' },
                    { label: 'Lengde', value: '73', unit: 'm' },
                    { label: 'Høyde', value: '20', unit: 'm' },
                    { label: 'Materiale', value: 'Kalkstein (én blokk)' },
                    { label: 'Retning', value: 'Øst (soloppgang)' },
                ],
                imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Great_Sphinx_of_Giza_-_20080716a.jpg/640px-Great_Sphinx_of_Giza_-_20080716a.jpg',
                wikipediaUrl: 'https://no.wikipedia.org/wiki/Sfinxen_i_Giza',
                wikipediaTitle: 'Sfinxen_i_Giza',
            },
        ],
        tour: {
            title: 'Giza — der himmelen møter sand',
            stops: [
                {
                    monumentId: 'khufu',
                    caption: 'Khufus pyramide — i 3800 år verdens høyeste byggverk.',
                    durationMs: 8000,
                    cameraRangeM: 600,
                    headingDeg: 45,
                    pitchDeg: -25,
                },
                {
                    monumentId: 'khafre',
                    caption: 'Khafre — bygget på høyere grunn for å virke større enn faren.',
                    durationMs: 8000,
                    cameraRangeM: 550,
                    headingDeg: 90,
                    pitchDeg: -22,
                },
                {
                    monumentId: 'menkaure',
                    caption: 'Menkaure — den minste av de tre, men granitten brant rødt i sola.',
                    durationMs: 7000,
                    cameraRangeM: 400,
                    headingDeg: 135,
                    pitchDeg: -20,
                },
                {
                    monumentId: 'sphinx',
                    caption: 'Sfinxen — vakt og vokter, øynene festet på soloppgangen.',
                    durationMs: 9000,
                    cameraRangeM: 200,
                    headingDeg: 270,
                    pitchDeg: -15,
                },
            ],
        },
    },
];

/** Slå opp et monument på id på tvers av alle samlinger. */
export function findMonument(id: string) {
    for (const site of HERITAGE_SITES) {
        const m = site.monuments.find((mon) => mon.id === id);
        if (m) return { site, monument: m };
    }
    return null;
}
