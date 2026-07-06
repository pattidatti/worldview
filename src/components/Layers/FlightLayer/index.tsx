// FlightLayer: kanal + primitive-renderer (renderplan-arkitektur, Fase B).
// Det gamle Entity-baserte laget og flights2-migreringsflagget er fjernet —
// V2 er nå den eneste fly-stien. Beholdt som re-export så App-importen
// (`import { FlightLayer } from '.../FlightLayer'`) er uendret.

export { FlightLayerV2 as FlightLayer } from './FlightLayerV2';
