export type SatelliteCategory = 'gps' | 'comm' | 'military' | 'science' | 'iss' | 'other';

export function categorizeSatellite(name: string): SatelliteCategory {
    const n = name.toUpperCase();
    if (n.includes('ISS') || n.includes('ZARYA') || n.includes('UNITY') || n.includes('ZVEZDA')) return 'iss';
    if (n.includes('GPS') || n.includes('NAVSTAR') || n.includes('GLONASS') || n.includes('GALILEO') || n.includes('BEIDOU') || n.includes('COMPASS')) return 'gps';
    if (n.includes('MILSTAR') || n.includes('AEHF') || n.includes('WGS ') || n.includes('MUOS') || n.includes('USA ') || n.includes('COSMOS') || n.includes('NROL') || n.includes('DSP ') || n.includes('SBIRS')) return 'military';
    if (n.includes('HUBBLE') || n.includes('HST') || n.includes('CHANDRA') || n.includes('TERRA') || n.includes('AQUA') || n.includes('LANDSAT') || n.includes('SENTINEL') || n.includes('ICESAT') || n.includes('GRACE') || n.includes('SUOMI') || n.includes('CALIPSO') || n.includes('GOES') || n.includes('METOP')) return 'science';
    return 'comm';
}

export const SAT_COLORS: Record<SatelliteCategory, string> = {
    gps:      '#ffd700',
    comm:     '#00d4ff',
    military: '#ff3344',
    science:  '#cc44ff',
    iss:      '#ffffff',
    other:    '#888888',
};
