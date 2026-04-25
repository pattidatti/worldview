import { type ConflictEvent, type ConflictEventType } from '@/types/conflict';

const EVENT_WEIGHTS: Record<ConflictEventType, number> = {
    'Battles': 5,
    'Explosions/Remote violence': 4,
    'Violence against civilians': 4,
    'Riots': 2,
    'Protests': 1,
    'Strategic developments': 1,
};

// ACLED land-navn → Natural Earth NAME-felt
const ACLED_TO_NE: Record<string, string> = {
    'United States': 'United States of America',
    'Democratic Republic of Congo': 'Dem. Rep. Congo',
    'Republic of Congo': 'Congo',
    'Bosnia-Herzegovina': 'Bosnia and Herz.',
    'Central African Republic': 'Central African Rep.',
    'Czech Republic': 'Czechia',
    'Dominican Republic': 'Dominican Rep.',
    'Equatorial Guinea': 'Eq. Guinea',
    'South Sudan': 'S. Sudan',
    'Ivory Coast': "Côte d'Ivoire",
    'Swaziland': 'eSwatini',
    'East Timor': 'Timor-Leste',
    'Somaliland': 'Somaliland',
    'Kosovo': 'Kosovo',
    'Palestine': 'Palestine',
};

export function normalizeCountryName(acledName: string): string {
    return ACLED_TO_NE[acledName] ?? acledName;
}

export function computeTensionScores(conflicts: ConflictEvent[]): Map<string, number> {
    const raw = new Map<string, number>();

    for (const event of conflicts) {
        const country = normalizeCountryName(event.country);
        if (!country) continue;
        const weight = EVENT_WEIGHTS[event.eventType] ?? 1;
        const score = weight * (1 + event.fatalities * 0.1);
        raw.set(country, (raw.get(country) ?? 0) + score);
    }

    if (raw.size === 0) return raw;

    const maxScore = Math.max(...raw.values());
    const normalized = new Map<string, number>();
    for (const [country, score] of raw) {
        normalized.set(country, score / maxScore);
    }
    return normalized;
}

export function tensionToFillAlpha(score: number): number {
    if (score < 0.05) return 0;
    if (score < 0.15) return 0.06;
    if (score < 0.3) return 0.11;
    if (score < 0.5) return 0.17;
    if (score < 0.7) return 0.24;
    return 0.32;
}

export function tensionToColor(score: number): [number, number, number] {
    // Fargegradient: gul → oransje → rød
    if (score < 0.3) return [255, 200, 0];      // gul
    if (score < 0.5) return [255, 120, 0];      // oransje
    if (score < 0.7) return [255, 50, 0];       // dyp oransje
    return [255, 0, 0];                          // rød
}
