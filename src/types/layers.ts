export type LayerId = 'flights' | 'ships' | 'satellites' | 'weather' | 'webcams' | 'traffic' | 'trafficFlow' | 'infrastructure' | 'infrastructurePipelines' | 'infrastructureFields' | 'power' | 'wind' | 'harbors' | 'lighthouses' | 'telecom' | 'mines' | 'buildings' | 'submarineCables' | 'earthquakes' | 'disasters' | 'asteroids' | 'news' | 'conflicts' | 'weatherRadar';

export interface LayerConfig {
    id: LayerId;
    name: string;
    color: string;
    visible: boolean;
    loading: boolean;
    count: number;
    error: string | null;
    lastUpdated: number | null;
}

export const LAYER_ICONS: Record<LayerId, string> = {
    flights: '✈',
    ships: '⚓',
    satellites: '🛰',
    weather: '☁',
    webcams: '📷',
    traffic: '🚗',
    trafficFlow: '🚦',
    infrastructure: '🛢',
    infrastructurePipelines: '〰',
    infrastructureFields: '⬡',
    power: '⚡',
    wind: '💨',
    harbors: '⚓',
    lighthouses: '🔦',
    telecom: '📡',
    mines: '⛏',
    buildings: '🏙',
    submarineCables: '🌊',
    earthquakes: '🌍',
    disasters: '🔥',
    asteroids: '☄',
    news: '📰',
    conflicts: '⚔',
    weatherRadar: '🌧',
};

export interface LayerCategory {
    id: string;
    label: string;
    icon: string;
    layers: LayerId[];
}

export const LAYER_CATEGORIES: LayerCategory[] = [
    { id: 'trafikk', label: 'Trafikk', icon: '✈', layers: ['flights', 'traffic', 'trafficFlow'] },
    { id: 'maritim', label: 'Maritim', icon: '⚓', layers: ['ships', 'harbors', 'lighthouses', 'submarineCables'] },
    { id: 'energi', label: 'Energi', icon: '⚡', layers: ['power', 'wind', 'infrastructureFields', 'infrastructurePipelines', 'infrastructure'] },
    { id: 'vaer', label: 'Vær', icon: '☁', layers: ['weather', 'weatherRadar'] },
    { id: 'geo', label: 'Geo', icon: '🌍', layers: ['earthquakes', 'disasters'] },
    { id: 'rom', label: 'Rom', icon: '🛰', layers: ['satellites', 'asteroids'] },
    { id: 'verden', label: 'Verden', icon: '🌐', layers: ['news', 'conflicts', 'webcams', 'buildings', 'telecom', 'mines'] },
];

export const LAYER_DEFAULTS: LayerConfig[] = [
    { id: 'flights', name: 'Flytrafikk', color: 'var(--color-flights)', visible: false, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'ships', name: 'Skipstrafikk', color: 'var(--color-ships)', visible: false, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'satellites', name: 'Satellitter', color: 'var(--color-satellites)', visible: false, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'weather', name: 'Vær', color: 'var(--color-weather)', visible: false, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'webcams', name: 'Webkameraer', color: 'var(--color-webcams)', visible: false, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'traffic', name: 'Veitrafikk', color: 'var(--color-traffic-green)', visible: false, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'trafficFlow', name: 'Trafikkflyt', color: 'var(--color-traffic-green)', visible: false, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'infrastructure', name: 'Installasjoner', color: 'var(--color-infrastructure)', visible: false, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'infrastructurePipelines', name: 'Rørledninger', color: 'var(--color-infrastructure-pipelines)', visible: false, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'infrastructureFields', name: 'Olje/gass-felt', color: 'var(--color-infrastructure-fields)', visible: false, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'power', name: 'Kraftinfrastruktur', color: 'var(--color-power)', visible: false, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'wind', name: 'Vindturbiner', color: 'var(--color-wind)', visible: false, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'harbors', name: 'Havner og kaier', color: 'var(--color-harbors)', visible: false, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'lighthouses', name: 'Fyrtårn', color: 'var(--color-lighthouses)', visible: false, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'telecom', name: 'Telekommunikasjon', color: 'var(--color-telecom)', visible: false, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'mines', name: 'Gruver', color: 'var(--color-mines)', visible: false, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'buildings', name: '3D-bygg', color: '#aaccff', visible: false, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'submarineCables', name: 'Sjøkabler', color: '#00d4ff', visible: false, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'earthquakes', name: 'Jordskjelv', color: '#ff3333', visible: false, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'disasters', name: 'Naturkatastrofer', color: '#ff4400', visible: false, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'asteroids', name: 'Asteroider', color: '#aaaaaa', visible: false, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'news', name: 'Nyheter', color: 'var(--color-news)', visible: false, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'conflicts', name: 'Konflikter', color: 'var(--color-conflicts)', visible: false, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'weatherRadar', name: 'Værradar', color: 'var(--color-weather-radar)', visible: false, loading: false, count: 0, error: null, lastUpdated: null },
];
