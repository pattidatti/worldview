# FlightLayer V1 → V2 — parity-note (Fase B-utrulling)

Denne noten dokumenterer feature-parity mellom det legacy Entity-baserte flylaget
(`FlightLayer.tsx`) og den nye primitive-baserte renderplan-implementasjonen
(`FlightLayerV2.tsx` + `render/FlightRenderer.ts`), samt de bevisste avvikene som
gjøres i overgangen. Se `docs/ARCHITECTURE-VISION.md` for det store bildet.

## Dekket (full parity)

- Billboard-ikoner med heading-rotasjon og `scaleByDistance` (samme kurve som V1).
- Farge etter `positionSource` + militær-styling (identisk palett via `render/flightIcons.ts`).
- Trails (PolylineGlow, militærfarge, maks 40 punkter) — i LOKAL/NÆR innenfor LODGovernor-kvote.
- Fade inn/ut (500/350 ms) via delt animasjonsdriver.
- Popup/tooltip/GEOINT — delt innhold i `flightPopup.ts` (rute-enrichment, airline-logo,
  militær, `followEntityId`). Regresjonsvakt: `__tests__/flightPopup.test.ts`.
- Gate-crossings over store-deltaer (poll-kadens, stale-vern 2× poll).
- Replay-modus, mode-switch/cursor-jump-reset, cinematic-pause.
- Kamera-«Følg» via `core/trackingProviders` (primitives finnes ikke i DataSource-treet).
- Selection- + hover-bracket (EntitySelector) og HoloBeam via `usePrimitiveScreenPos`
  (arch(B8) — se `hooks/usePrimitiveScreenPos.ts`).
- `onGround`-fly skjules (parkerte/taxiende), parity med V1 — både i rendereren og i
  crossing-deteksjonen.

## Bevisste avvik (INTENT)

- **Klustring → tetthetsceller.** V1 brukte Cesium `configureCluster` med nummererte
  cluster-bobler. V2 bruker i GLOBAL-tier en `PointPrimitiveCollection` med log-skalerte
  tetthetsprikker (`utils/densityGrid`), pick → fly-til-celle. Én draw for hele verden i
  stedet for tusenvis av Entity-baserte cluster-billboards. Dette er hele poenget med
  «masse data raskt».
- **Labels lagt til.** V2 viser callsign-labels i LOKAL/NÆR innenfor kvote; V1 hadde ingen.
  Regnes som forbedring, ikke regresjon.
- **Trail-utvalg via kvote.** V1 tegnet trail for alle fly < 500 km. V2 tegner trail for de
  nærmeste-kamera flyene innenfor LODGovernors polyline-kvote. Begrenser frame-kostnaden ved
  høy tetthet; øvre grense på synlige trails er bevisst.

## Droppet bevisst

- **Pulse-ringer på nye fly.** V1 spawnet en pulse-ring-Entity per nytt fly. Droppet i V2:
  fade-inn er entry-animasjonen i primitive-stien, og pulse-ringer per nytt fly (hundrevis
  per poll ved 2000-flys skala) ville jobbe direkte mot 60fps-akseptansekriteriet. Kan
  vurderes portet senere som en batched primitive hvis ønskelig.

## Utsatt (fremtidig arbeid)

- **3D-flymodeller < 500 km (tidligere «B8»).** V1 byttet til glTF-modell + silhuett +
  orientering nær kamera. Ikke portert ennå — NÆR-tier viser fortsatt billboard-ikonet.
  Krever modell-lasting og LOD-bytte i rendereren; gjøres som eget steg ved behov.
