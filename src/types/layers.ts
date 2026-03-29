export type LayerId = 'flights' | 'ships' | 'satellites' | 'weather' | 'webcams' | 'traffic' | 'infrastructure';

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
    infrastructure: '🛢',
};

export const LAYER_DEFAULTS: LayerConfig[] = [
    { id: 'flights', name: 'Flytrafikk', color: 'var(--color-flights)', visible: true, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'ships', name: 'Skipstrafikk', color: 'var(--color-ships)', visible: true, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'satellites', name: 'Satellitter', color: 'var(--color-satellites)', visible: true, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'weather', name: 'Vær', color: 'var(--color-weather)', visible: true, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'webcams', name: 'Webkameraer', color: 'var(--color-webcams)', visible: true, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'traffic', name: 'Veitrafikk', color: 'var(--color-traffic-green)', visible: true, loading: false, count: 0, error: null, lastUpdated: null },
    { id: 'infrastructure', name: 'Infrastruktur', color: 'var(--color-infrastructure)', visible: false, loading: false, count: 0, error: null, lastUpdated: null },
];
