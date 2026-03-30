export type SigmetHazard = 'TURB' | 'ICE' | 'IFR' | 'MTN' | 'PCPN' | 'VA' | 'TROP' | string;

export interface Sigmet {
    id: string;
    hazard: SigmetHazard;
    severity: string;
    altitudeLow: number | null;
    altitudeHigh: number | null;
    validFrom: string;
    validTo: string;
    area: string;
    coordinates: number[][][]; // rings: first is outer, rest are holes
}
