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
 * SVG ship icon per skipstype-kategori
 * Returnerer en data URI med heading-rotasjon
 */
export function createShipIcon(heading: number, shipType: number): string {
    const h = Math.round(heading);
    let path: string;
    let fill: string;
    let stroke: string;

    if (shipType >= 60 && shipType <= 69) {
        // Passasjerskip — bred, rund form
        fill = '#e040ff';
        stroke = '#7020aa';
        path = 'M10 3 L14 8 L14 15 L10 17 L6 15 L6 8 Z';
    } else if (shipType >= 70 && shipType <= 79) {
        // Lasteskip — bred boks med spiss baug
        fill = '#44cc44';
        stroke = '#227722';
        path = 'M10 3 L14 7 L14 16 L6 16 L6 7 Z';
    } else if (shipType >= 80 && shipType <= 89) {
        // Tankskip — avrundet, bred
        fill = '#ff6644';
        stroke = '#aa3322';
        path = 'M10 3 L13 7 Q15 12 13 16 L7 16 Q5 12 7 7 Z';
    } else if (shipType === 30 || shipType === 7 || (shipType >= 10 && shipType <= 19)) {
        // Fiskebåt — liten, kompakt
        fill = '#ffcc00';
        stroke = '#aa8800';
        path = 'M10 5 L12 10 L12 15 L10 16 L8 15 L8 10 Z';
    } else if (shipType >= 31 && shipType <= 32) {
        // Slepebåt — firkantet, kraftig
        fill = '#ff8844';
        stroke = '#aa5522';
        path = 'M10 4 L13 7 L13 15 L7 15 L7 7 Z';
    } else if (shipType >= 40 && shipType <= 49) {
        // Hurtigbåt — slank, spiss
        fill = '#00eeff';
        stroke = '#0088aa';
        path = 'M10 2 L12 8 L12 16 L10 17 L8 16 L8 8 Z';
    } else if (shipType >= 50 && shipType <= 59) {
        // Spesialfartøy — diamant
        fill = '#aaaaff';
        stroke = '#5555aa';
        path = 'M10 3 L14 10 L10 17 L6 10 Z';
    } else {
        // Standard — enkel pil
        fill = '#00d4ff';
        stroke = '#005577';
        path = 'M10 3 L13.5 15 L10 13 L6.5 15 Z';
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
        <g transform="rotate(${h}, 10, 10)">
            <path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="0.7" stroke-linejoin="round"/>
        </g>
    </svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
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
