# Punktlag → PointRenderer — parity-note (Fase D)

Denne noten dokumenterer feature-parity mellom de seks tidligere Entity-baserte
punktlagene og den nye forente primitive-implementasjonen. Se
`docs/ARCHITECTURE-VISION.md` (Fase D) for det store bildet.

## Forent

Seks lag-komponenter (`EarthquakeLayer`, `NewsLayer`, `ConflictLayer`,
`DisasterLayer`, `VolcanoLayer`, `LaunchesLayer`) er erstattet av:

- **Dataplan**: `data/channels/pointChannel.ts` (generisk `PointChannel<T>`) +
  ett konfig-objekt per lag i `data/channels/pointConfigs/`.
- **Renderplan**: `render/PointRenderer.ts` (én `BillboardCollection` ELLER
  `PointPrimitiveCollection` per lag) + delt ikon-atlas (`render/atlasSpecs.ts`).
- **UI-plan**: én generisk shim `components/Layers/PointLayer/PointLayer.tsx`,
  montert per konfig av `PointLayers`.

Å legge til et punktlag = ett konfig-objekt i `pointConfigs/`. Ingen ny
komponent, service-kobling eller App-mount.

## Dekket (full parity)

- Ikonografi (farget ring + emoji-glyf) — tegnet inn i det delte atlaset i stedet
  for per-ikon data-URI-SVG, men samme uttrykk. GPU-batchbart (én tekstur).
- Popup/tooltip/GEOINT — identisk innhold, flyttet ordrett til konfig-byggerne
  (inkl. earthquakes' `enrichAsync` mot Wikipedia).
- Fade-inn på nye markører (500 ms) via delt animasjonsdriver.
- Pulse-ringer på nye hendelser (conflicts, disasters) — nå primitive-ringer
  drevet av `RenderScheduler.animate` (samme easing/varighet).
- Status → `layerStore`, synlighet → attach/detach, cinematic-pause.

## Bevisste avvik

- **Klustring → GLOBAL-tetthetsceller.** Cesium-klustringen (news, conflicts) er
  byttet mot tetthetsceller ved GLOBAL-tier (primitives har ingen innebygd
  klustring, jf. flylagets tetthetsmodus). Ved REGION og finere vises alle
  markører individuelt. Klikk på celle zoomer mot cellesenteret.
- **Earthquakes: bakke-skive → punkt.** Legacy tegnet en `EllipseGraphics` i
  meter der radius ∝ magnitude (geografisk fotavtrykk). Ny renderer bruker et
  farget punkt der piksel-størrelse ∝ magnitude og farge ∝ dybde. Informasjonen
  (magnitude, dybde) er bevart; den geografiske fotavtrykk-skalaen er det ikke.
- **Ingen selection-bracket for punktlag.** Punkt-popups setter ikke
  `followEntityId` (statiske hendelser skal ikke kamera-følges), så
  EntitySelector-bracketen vises ikke slik den gjorde for Entity-valg. Popup +
  HoloBeam-origin fungerer som før.

## Ikke migrert (bevisst utenfor Fase D)

Lette/avvikende lag som forblir på Entity-mønsteret (vision tillater dette
eksplisitt): `AsteroidLayer` (syntetisk rombane), `ISSLayer` (én rask entitet +
trail), `WebcamLayer`/`HarborLayer`/`LighthouseLayer`/`TelecomLayer`/`MineLayer`
(viewport/høyde-styrte OSM-lag), `LightningLayer` (streaming + TTL-fade),
`RoadCameraLayer`/`SigmetLayer`/`TensionLayer`/`ChokepointLayer` (polygon/
choropleth/animert). Disse kan følge etter ved behov, eller bli værende.
