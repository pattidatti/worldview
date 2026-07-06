// Registret over forente punktlag (Fase D). Å legge til et punktlag = legg til
// ett konfig-objekt her; ingen ny komponent, service-kobling eller App-mount.

import type { PointLayerConfig } from '@/data/channels/pointProtocol';
import type { LayerId } from '@/types/layers';
import { newsConfig } from './news';
import { disastersConfig } from './disasters';
import { volcanoesConfig } from './volcanoes';
import { launchesConfig } from './launches';
import { conflictsConfig } from './conflicts';
import { earthquakesConfig } from './earthquakes';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const POINT_LAYER_CONFIGS: PointLayerConfig<any>[] = [
    newsConfig,
    disastersConfig,
    volcanoesConfig,
    launchesConfig,
    conflictsConfig,
    earthquakesConfig,
];

export const POINT_LAYER_IDS: LayerId[] = POINT_LAYER_CONFIGS.map((c) => c.layerId);
