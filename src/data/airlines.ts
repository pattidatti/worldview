export interface AirlineInfo {
    name: string;
    iataCode: string; // For logo-URL: https://pics.avs.io/200/80/{iataCode}.png
}

// Callsign-prefiks (ICAO) → flyselskapsnavn + IATA-kode
// Prefiks er de 3 første tegnene i callsign (evt. 2 for noen selskaper)
export const AIRLINE_LOOKUP: Record<string, AirlineInfo> = {
    // Skandinavia
    'SAS': { name: 'Scandinavian Airlines', iataCode: 'SK' },
    'NAX': { name: 'Norwegian Air Shuttle', iataCode: 'DY' },
    'WIF': { name: 'Widerøe', iataCode: 'WF' },
    'BRA': { name: 'Braathens Regional', iataCode: 'TF' },
    'FIN': { name: 'Finnair', iataCode: 'AY' },

    // Storbritannia / Irland
    'BAW': { name: 'British Airways', iataCode: 'BA' },
    'EZY': { name: 'easyJet', iataCode: 'U2' },
    'VIR': { name: 'Virgin Atlantic', iataCode: 'VS' },
    'EIN': { name: 'Aer Lingus', iataCode: 'EI' },
    'RUK': { name: 'Ryanair UK', iataCode: 'FR' },

    // Mellom-Europa
    'DLH': { name: 'Lufthansa', iataCode: 'LH' },
    'AFR': { name: 'Air France', iataCode: 'AF' },
    'KLM': { name: 'KLM', iataCode: 'KL' },
    'SWR': { name: 'Swiss International', iataCode: 'LX' },
    'AUA': { name: 'Austrian Airlines', iataCode: 'OS' },
    'BEL': { name: 'Brussels Airlines', iataCode: 'SN' },
    'IBE': { name: 'Iberia', iataCode: 'IB' },
    'VLG': { name: 'Vueling', iataCode: 'VY' },
    'TAP': { name: 'TAP Air Portugal', iataCode: 'TP' },
    'AZA': { name: 'ITA Airways', iataCode: 'AZ' },
    'THY': { name: 'Turkish Airlines', iataCode: 'TK' },
    'LOT': { name: 'LOT Polish Airlines', iataCode: 'LO' },
    'CSA': { name: 'Czech Airlines', iataCode: 'OK' },

    // Lavpris Europa
    'RYR': { name: 'Ryanair', iataCode: 'FR' },
    'WZZ': { name: 'Wizz Air', iataCode: 'W6' },
    'TUI': { name: 'TUI fly', iataCode: 'X3' },
    'EXS': { name: 'Jet2', iataCode: 'LS' },
    'DSM': { name: 'Transavia', iataCode: 'HV' },

    // Midtøsten
    'UAE': { name: 'Emirates', iataCode: 'EK' },
    'QTR': { name: 'Qatar Airways', iataCode: 'QR' },
    'ETD': { name: 'Etihad Airways', iataCode: 'EY' },
    'SVA': { name: 'Saudia', iataCode: 'SV' },
    'GFA': { name: 'Gulf Air', iataCode: 'GF' },

    // Afrika
    'ETH': { name: 'Ethiopian Airlines', iataCode: 'ET' },
    'KQA': { name: 'Kenya Airways', iataCode: 'KQ' },

    // Nord-Amerika
    'UAL': { name: 'United Airlines', iataCode: 'UA' },
    'AAL': { name: 'American Airlines', iataCode: 'AA' },
    'DAL': { name: 'Delta Air Lines', iataCode: 'DL' },
    'SWA': { name: 'Southwest Airlines', iataCode: 'WN' },
    'ACA': { name: 'Air Canada', iataCode: 'AC' },
    'WJA': { name: 'WestJet', iataCode: 'WS' },

    // Asia / Oseania
    'ANA': { name: 'All Nippon Airways', iataCode: 'NH' },
    'JAL': { name: 'Japan Airlines', iataCode: 'JL' },
    'CCA': { name: 'Air China', iataCode: 'CA' },
    'CSN': { name: 'China Southern', iataCode: 'CZ' },
    'CES': { name: 'China Eastern', iataCode: 'MU' },
    'KAL': { name: 'Korean Air', iataCode: 'KE' },
    'SIA': { name: 'Singapore Airlines', iataCode: 'SQ' },
    'MAS': { name: 'Malaysia Airlines', iataCode: 'MH' },
    'THA': { name: 'Thai Airways', iataCode: 'TG' },
    'CPA': { name: 'Cathay Pacific', iataCode: 'CX' },
    'QFA': { name: 'Qantas', iataCode: 'QF' },
    'ANZ': { name: 'Air New Zealand', iataCode: 'NZ' },
    'IAW': { name: 'Iraqi Airways', iataCode: 'IA' },
};

export function lookupAirline(callsign: string): AirlineInfo | null {
    if (!callsign) return null;
    const prefix3 = callsign.slice(0, 3).toUpperCase();
    const prefix2 = callsign.slice(0, 2).toUpperCase();
    return AIRLINE_LOOKUP[prefix3] ?? AIRLINE_LOOKUP[prefix2] ?? null;
}
