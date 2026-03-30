export type ImageryMode = 'satellite' | 'photorealistic3d' | 'map' | 'blend';

export const IMAGERY_MODES: { id: ImageryMode; label: string; icon: string; description: string }[] = [
    { id: 'satellite', label: 'Satellitt', icon: '🛰', description: 'ESRI World Imagery' },
    { id: 'photorealistic3d', label: '3D', icon: '🏙', description: 'Google Photorealistisk 3D' },
    { id: 'map', label: 'Kart', icon: '🗺', description: 'CartoDB Positron' },
    { id: 'blend', label: 'Blanding', icon: '⊞', description: 'Satellitt + veinett' },
];
