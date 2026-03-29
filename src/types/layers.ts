export type LayerId = 'flights' | 'ships' | 'satellites' | 'weather' | 'webcams' | 'traffic';

export interface LayerConfig {
    id: LayerId;
    name: string;
    color: string;
    visible: boolean;
    loading: boolean;
    count: number;
}

export const LAYER_DEFAULTS: LayerConfig[] = [
    { id: 'flights', name: 'Flytrafikk', color: 'var(--color-flights)', visible: true, loading: false, count: 0 },
    { id: 'ships', name: 'Skipstrafikk', color: 'var(--color-ships)', visible: true, loading: false, count: 0 },
    { id: 'satellites', name: 'Satellitter', color: 'var(--color-satellites)', visible: true, loading: false, count: 0 },
    { id: 'weather', name: 'Vær', color: 'var(--color-weather)', visible: true, loading: false, count: 0 },
    { id: 'webcams', name: 'Webkameraer', color: 'var(--color-webcams)', visible: true, loading: false, count: 0 },
    { id: 'traffic', name: 'Veitrafikk', color: 'var(--color-traffic-green)', visible: true, loading: false, count: 0 },
];
