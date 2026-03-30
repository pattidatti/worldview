export type ShaderOverlayMode = 'none' | 'nightvision' | 'crt' | 'thermal';

export const SHADER_OVERLAY_MODES: { id: ShaderOverlayMode; label: string; icon: string; description: string }[] = [
    { id: 'none',        label: 'Av',      icon: '◎',  description: 'Ingen effekt' },
    { id: 'nightvision', label: 'Nattsyn', icon: '🟢', description: 'Grønn fosfor, skannlinjer, vignett' },
    { id: 'crt',         label: 'CRT',     icon: '📺', description: 'Barrel-distorsjon, kromatisk aberrasjon' },
    { id: 'thermal',     label: 'Termisk', icon: '🌡', description: 'Varmekart-spektrum' },
];
