// Flagg-dispatcher for FlightLayer-migreringen (fase B): flights2-flagget
// velger mellom legacy Entity-laget og v2 (kanal + primitive-renderer).
// Evalueres ved mount — bytte krever reload.

import { FlightLayer as FlightLayerV1 } from './FlightLayer';
import { FlightLayerV2 } from './FlightLayerV2';
import { isFlightsV2Enabled } from '@/utils/featureFlags';

export function FlightLayer() {
    return isFlightsV2Enabled() ? <FlightLayerV2 /> : <FlightLayerV1 />;
}
