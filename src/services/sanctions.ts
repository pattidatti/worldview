/** Sjekker US Treasury OFAC SDN-lista for sanksjonerte skip via IMO-nummer. */

import { getJsonCache, setJsonCache } from './firestoreCache';

const OFAC_URL = 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.JSON';
const CACHE_KEY = 'worldview-ofac-vessels';
const FS_KEY = 'ofac:sdn';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 timer

interface OfacVessel {
    imo: number;
    name: string;
    programs: string[];
    remarks: string;
}

export interface SanctionResult {
    name: string;
    programs: string[];
    remarks: string;
}

let indexPromise: Promise<Map<number, OfacVessel>> | null = null;

async function buildIndex(): Promise<Map<number, OfacVessel>> {
    try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
            const { ts, vessels } = JSON.parse(cached) as { ts: number; vessels: OfacVessel[] };
            if (Date.now() - ts < CACHE_TTL) {
                return new Map(vessels.map(v => [v.imo, v]));
            }
        }
    } catch { /* ignore */ }

    // L2.5: delt Firestore-cache — SDN-lista (parset til skip) er identisk for
    // alle brukere. Sparer nedlasting av hele SDN.JSON (stor fil) per bruker.
    const fsVessels = await getJsonCache<OfacVessel[]>(FS_KEY, CACHE_TTL);
    if (fsVessels) {
        try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), vessels: fsVessels }));
        } catch { /* kvote full — hopp over */ }
        return new Map(fsVessels.map(v => [v.imo, v]));
    }

    const response = await fetch(OFAC_URL, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`OFAC ${response.status}`);
    const json = await response.json() as { sdnList?: { sdnEntry?: unknown[] } };

    const entries = json?.sdnList?.sdnEntry ?? [];
    const vessels = new Map<number, OfacVessel>();

    for (const raw of entries) {
        const e = raw as {
            sdnType?: string;
            lastName?: string;
            idList?: { id?: { idType?: string; idNumber?: string }[] };
            programList?: { program?: string[] };
            remarks?: string;
        };
        if (e.sdnType !== 'Vessel') continue;
        const imoEntry = (e.idList?.id ?? []).find(x => x.idType === 'IMO');
        if (!imoEntry?.idNumber) continue;
        const imo = parseInt(imoEntry.idNumber.replace(/\D/g, ''));
        if (!imo) continue;
        vessels.set(imo, {
            imo,
            name: e.lastName ?? 'Ukjent',
            programs: e.programList?.program ?? [],
            remarks: e.remarks ?? '',
        });
    }

    const vesselList = [...vessels.values()];
    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), vessels: vesselList }));
    } catch { /* kvotar full — hopp over cache */ }
    setJsonCache(FS_KEY, CACHE_TTL, vesselList);

    return vessels;
}

export async function checkSanctions(imo: number): Promise<SanctionResult | null> {
    if (!imo) return null;
    if (!indexPromise) {
        indexPromise = buildIndex().catch(() => new Map<number, OfacVessel>());
    }
    const index = await indexPromise;
    const entry = index.get(imo);
    if (!entry) return null;
    return { name: entry.name, programs: entry.programs, remarks: entry.remarks };
}
