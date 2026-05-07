export type HeritageMonumentKind = 'pyramid' | 'sphinx' | 'temple' | 'megalith' | 'monument';

export interface HeritageFact {
    label: string;
    value: string;
    unit?: string;
}

export interface HeritageTourStop {
    monumentId: string;
    /** Tekst som vises i tekstboblen ved dette stoppet. */
    caption: string;
    /** Hvor lang tid stoppet skal vare (ms) før kameraet glir videre. */
    durationMs: number;
    /** Avstand i meter fra monumentet kameraet skal stå. */
    cameraRangeM: number;
    /** Heading i grader (0 = nord). */
    headingDeg: number;
    /** Pitch i grader (negativ = ned mot bakken). */
    pitchDeg: number;
}

export interface HeritageMonument {
    id: string;
    /** Hvilken samling/site dette monumentet tilhører (f.eks. "giza"). */
    siteId: string;
    name: string;
    kind: HeritageMonumentKind;
    /** Koordinat for monumentets senter (lon, lat i grader). */
    center: { lon: number; lat: number };
    /** Sidekant i meter ved bakken (for pyramider; for andre brukes som tilnærmet utstrekning). */
    baseSizeM: number;
    /** Høyde over bakken i meter. */
    heightM: number;
    /** Hex-farge for glow/lyssøyle. */
    glowColor: string;
    /** Bakkehøyde i meter (Giza-platået ligger ~60m over havet). */
    groundElevationM: number;
    /** Korte fakta som vises i 2D-popup og som 3D-billboards. */
    facts: HeritageFact[];
    /** Kort, fortellende sammendrag (norsk bokmål). */
    summary: string;
    /** Wow-faktum som vises som 3D-billboard. */
    wowFact?: string;
    /** Bilde-URL (Wikimedia eller annen kilde). */
    imageUrl?: string;
    /** Wikipedia-artikkel-URL. */
    wikipediaUrl?: string;
    /** Wikipedia-tittel for ekstra enrichment. */
    wikipediaTitle?: string;
}

export interface HeritageSite {
    id: string;
    name: string;
    /** Samlet senter for hele samlingen (brukes for "ankomst"-deteksjon). */
    center: { lon: number; lat: number };
    monuments: HeritageMonument[];
    tour: {
        title: string;
        stops: HeritageTourStop[];
    };
}
