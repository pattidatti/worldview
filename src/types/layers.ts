export type LayerId = 'flights' | 'ships' | 'satellites' | 'weather' | 'webcams' | 'traffic' | 'trafficFlow' | 'infrastructure' | 'infrastructurePipelines' | 'infrastructureFields' | 'power' | 'wind' | 'harbors' | 'lighthouses' | 'telecom' | 'mines' | 'buildings' | 'submarineCables' | 'earthquakes';

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
};

export const LAYER_DEFAULTS: LayerConfig[] = [
    { id: 'flights', name: 'Flytrafikk', color: 'var(--color-flights)', visible: false, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'ships', name: 'Skipstrafikk', color: 'var(--color-ships)', visible: true, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'satellites', name: 'Satellitter', color: 'var(--color-satellites)', visible: false, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'weather', name: 'Vær', color: 'var(--color-weather)', visible: true, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'webcams', name: 'Webkameraer', color: 'var(--color-webcams)', visible: true, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'traffic', name: 'Veitrafikk', color: 'var(--color-traffic-green)', visible: true, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'trafficFlow', name: 'Trafikkflyt', color: 'var(--color-traffic-green)', visible: false, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'infrastructure', name: 'Installasjoner', color: 'var(--color-infrastructure)', visible: true, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'infrastructurePipelines', name: 'Rørledninger', color: 'var(--color-infrastructure-pipelines)', visible: true, loading: false, count: 0, error: null, lastUpdated: null },
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
];
