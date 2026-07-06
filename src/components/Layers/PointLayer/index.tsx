// Monterer ett PointLayer per konfig (Fase D). Erstatter de individuelle
// <NewsLayer/>, <ConflictLayer/>, <DisasterLayer/>, <VolcanoLayer/>,
// <LaunchesLayer/> og <EarthquakeLayer/> i App.tsx.

import { PointLayer } from './PointLayer';
import { POINT_LAYER_CONFIGS } from '@/data/channels/pointConfigs';

export function PointLayers() {
    return (
        <>
            {POINT_LAYER_CONFIGS.map((config) => (
                <PointLayer key={config.layerId} config={config} />
            ))}
        </>
    );
}

export { PointLayer } from './PointLayer';
