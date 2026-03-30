/**
 * IMO ship type codes → norsk lesbar tekst
 */
export function getShipTypeName(code: number): string {
    if (code >= 80 && code <= 89) return 'Tankskip';
    if (code >= 70 && code <= 79) return 'Lasteskip';
    if (code >= 60 && code <= 69) return 'Passasjerskip';
    if (code >= 40 && code <= 49) return 'Hurtigbåt';
    if (code >= 50 && code <= 59) return 'Spesialfartøy';
    if (code >= 31 && code <= 32) return 'Slepebåt';
    if (code === 30) return 'Fiskebåt';
    if (code >= 33 && code <= 39) return 'Havnefartøy';
    if (code >= 20 && code <= 29) return 'Grunnfartøy';
    if (code === 36) return 'Seilfartøy';
    if (code === 37) return 'Fritidsbåt';
    return 'Ukjent';
}

/**
 * Navigational status code → norsk tekst
 */
export function getNavStatusText(status: number): string {
    switch (status) {
        case 0: return 'Under motor';
        case 1: return 'For anker';
        case 2: return 'Ikke manøvreringsdyktig';
        case 3: return 'Begrenset manøvreringsevne';
        case 4: return 'Begrenset av dypgang';
        case 5: return 'Fortøyd';
        case 6: return 'Grunnstøtt';
        case 7: return 'Fiske';
        case 8: return 'Under seil';
        case 11: return 'Sleper';
        case 12: return 'Skyver';
        case 14: return 'AIS-SART aktiv';
        default: return '';
    }
}

/**
 * SVG ship icon per skipstype-kategori — topp-ned-silhuett
 * Returnerer en data URI med heading-rotasjon
 * Canvas 32×32, baug peker OPP ved 0° heading
 */
const shipIconCache = new Map<string, string>();

export function createShipIcon(heading: number, shipType: number): string {
    const h = Math.round(heading);
    const cacheKey = `${h}-${shipType}`;
    const cached = shipIconCache.get(cacheKey);
    if (cached) return cached;
    let body: string;

    if (shipType >= 60 && shipType <= 69) {
        // Passasjerskip — bred og kort, tydelig bredeste type
        body = `
            <path d="M16 5 L25 10 L25 24 L7 24 L7 10 Z" fill="#e040ff" stroke="#7020aa" stroke-width="1" stroke-linejoin="round"/>
            <rect x="11" y="11" width="10" height="9" rx="1" fill="#9020cc" opacity="0.65"/>`;
    } else if (shipType >= 70 && shipType <= 79) {
        // Lasteskip — langt smalt rektangel med spiss baug og fyrhus akter
        body = `
            <path d="M16 3 L20 9 L20 27 L12 27 L12 9 Z" fill="#44cc44" stroke="#227722" stroke-width="1" stroke-linejoin="round"/>
            <rect x="13" y="22" width="6" height="5" rx="0.5" fill="#2a8a2a"/>
            <line x1="16" y1="10" x2="16" y2="21" stroke="#227722" stroke-width="0.6" opacity="0.55"/>`;
    } else if (shipType >= 80 && shipType <= 89) {
        // Tankskip — lang organisk sigar-form
        body = `
            <path d="M16 3 Q22 8 22 17 Q22 27 16 29 Q10 27 10 17 Q10 8 16 3 Z" fill="#ff6644" stroke="#aa3322" stroke-width="1"/>
            <line x1="16" y1="5" x2="16" y2="27" stroke="#aa3322" stroke-width="0.6" opacity="0.5"/>`;
    } else if (shipType === 30 || shipType === 7 || (shipType >= 10 && shipType <= 19)) {
        // Fiskebåt — liten, kompakt
        body = `
            <path d="M16 8 L20 13 L20 23 L12 23 L12 13 Z" fill="#ffcc00" stroke="#aa8800" stroke-width="1" stroke-linejoin="round"/>
            <rect x="13" y="18" width="6" height="4" rx="0.5" fill="#cc9900" opacity="0.8"/>`;
    } else if (shipType >= 31 && shipType <= 32) {
        // Slepebåt — svært kort og bred, nesten sirkulær
        body = `
            <path d="M16 9 Q22 12 22 18 Q22 24 16 25 Q10 24 10 18 Q10 12 16 9 Z" fill="#ff8844" stroke="#aa5522" stroke-width="1"/>
            <circle cx="16" cy="19" r="3" fill="#cc6622" opacity="0.7"/>`;
    } else if (shipType >= 40 && shipType <= 49) {
        // Hurtigbåt — veldig slank og spiss
        body = `
            <path d="M16 2 L19 9 L18 27 L14 27 L13 9 Z" fill="#00eeff" stroke="#0088aa" stroke-width="1" stroke-linejoin="round"/>
            <line x1="16" y1="4" x2="16" y2="25" stroke="#0088aa" stroke-width="0.6" opacity="0.5"/>`;
    } else if (shipType >= 50 && shipType <= 59) {
        // Spesialfartøy — stubb baug, plattform-form
        body = `
            <path d="M14 7 L18 7 L22 11 L22 24 L10 24 L10 11 Z" fill="#aaaaff" stroke="#5555aa" stroke-width="1" stroke-linejoin="round"/>
            <rect x="12" y="12" width="8" height="9" rx="1" fill="#7777cc" opacity="0.6"/>`;
    } else {
        // Standard/ukjent — pilform
        body = `
            <path d="M16 4 L21 19 L16 16 L11 19 Z" fill="#00d4ff" stroke="#005577" stroke-width="1" stroke-linejoin="round"/>`;
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <g transform="rotate(${h}, 16, 16)">${body}
        </g>
    </svg>`;
    const result = 'data:image/svg+xml,' + encodeURIComponent(svg);
    shipIconCache.set(cacheKey, result);
    return result;
}

/**
 * MMSI → flaggstat via MID-kode (3 første siffer)
 */
const MID: Record<number, string> = {
    // Norden
    257: 'Norge', 258: 'Norge', 259: 'Norge',
    219: 'Danmark', 220: 'Danmark',
    265: 'Sverige', 266: 'Sverige',
    230: 'Finland', 231: 'Finland',
    251: 'Island',
    // Europa
    205: 'Belgia',
    209: 'Kypros', 210: 'Kypros', 212: 'Kypros',
    211: 'Tyskland',
    224: 'Spania', 225: 'Spania',
    226: 'Frankrike', 227: 'Frankrike', 228: 'Frankrike',
    229: 'Malta',
    232: 'Storbritannia', 233: 'Storbritannia', 234: 'Storbritannia', 235: 'Storbritannia',
    236: 'Gibraltar',
    237: 'Hellas', 238: 'Hellas', 239: 'Hellas', 240: 'Hellas', 241: 'Hellas',
    242: 'Marokko',
    243: 'Ungarn',
    244: 'Nederland', 245: 'Nederland', 246: 'Nederland',
    247: 'Italia', 248: 'Italia',
    249: 'Malta',
    250: 'Irland',
    253: 'Luxembourg',
    254: 'Monaco',
    255: 'Portugal', 256: 'Portugal',
    261: 'Polen',
    263: 'Portugal (Azorene)',
    264: 'Romania',
    267: 'Tsjekkia',
    268: 'Kroatia',
    269: 'Tyrkia', 271: 'Tyrkia',
    272: 'Ukraina',
    273: 'Russland', 274: 'Russland',
    275: 'Latvia',
    276: 'Estland',
    277: 'Litauen',
    278: 'Slovenia',
    279: 'Montenegro',
    // Amerika
    303: 'USA', 338: 'USA', 366: 'USA', 367: 'USA', 368: 'USA', 369: 'USA',
    316: 'Canada',
    345: 'Mexico',
    351: 'Bermuda',
    352: 'Barbados',
    353: 'Belize',
    354: 'Trinidad og Tobago',
    355: 'Panama', 356: 'Panama', 357: 'Panama',
    370: 'Panama', 371: 'Panama', 372: 'Panama', 373: 'Panama',
    // Asia
    401: 'Afghanistan',
    412: 'Kina', 413: 'Kina', 414: 'Kina',
    416: 'Taiwan',
    417: 'Sri Lanka',
    419: 'India',
    422: 'Iran',
    431: 'Japan', 432: 'Japan',
    440: 'Sør-Korea', 441: 'Sør-Korea',
    447: 'Indonesia',
    450: 'Malaysia',
    451: 'Filippinene',
    453: 'Singapore', 563: 'Singapore',
    455: 'Bangladesh',
    456: 'Thailand',
    457: 'Vietnam',
    470: 'De forente arabiske emirater',
    477: 'Hongkong',
    // Oseania
    503: 'Australia',
    512: 'New Zealand',
    // Afrika
    601: 'Sør-Afrika', 603: 'Sør-Afrika',
    618: 'Egypt',
    619: 'Mauritius',
    620: 'Kenya',
    621: 'Tanzania',
    622: 'Nigeria',
    636: 'Liberia', 637: 'Liberia',
};

export function getFlagState(mmsi: number): string {
    const mid = Math.floor(mmsi / 1_000_000);
    return MID[mid] ?? `MID ${mid}`;
}
