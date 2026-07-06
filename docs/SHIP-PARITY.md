# ShipLayer → V2 — parity-note (Fase C)

Parity mellom det legacy inline Entity-baserte skipslaget (`ShipLayer.tsx`, ~1160
linjer, 7 datasources + partikkelsystemer) og den nye kanal/renderplan-
implementasjonen. Se `docs/ARCHITECTURE-VISION.md` (Fase C) for det store bildet.

## Arkitektur

- **Dataplan**: `data/channels/shipChannel.ts` eier `AISStreamConnection` (WS,
  5s-batch, reconnect, viewport-resubscribe) og all flåte-intelligens (merge,
  60-min prune, `MAX_SHIPS`-cap, ghost-bokføring) som før lå i `onUpdate`.
  Skriver deltaer inn i `EntityStore('ships')`. **Ingen dead-reckoning** — ships
  har aldri hatt det (posisjon endres kun ved AIS-batch). Regresjonsvakt:
  `data/__tests__/shipChannel.test.ts`.
- **Renderplan**: `render/ShipRenderer.ts` — LOD-pyramide i primitives i stedet
  for ~15 entiteter per skip.
- **UI-plan**: `ShipLayerV2.tsx` (chrome) + `shipPopup.ts` (byggere).

## LOD-pyramide (kjernen i Fase C)

| Tier | Kamerahøyde | Innhold |
|------|-------------|---------|
| GLOBAL | > 5 000 km | tetthetsceller (erstatter Cesium-klustring) |
| REGION | 250–5 000 km | skrog-billboard (type-tintet, heading-rotert) |
| LOKAL | 25–250 km | + trails + labels (nærmest-kamera, LODGovernor-kvote) |
| NÆR | < 25 km | + 3D skrog-boks (nærmest-kamera, maks 80) |

Før: 15 entiteter × N skip, alltid. Nå: 1 billboard (primitive-batch) + 3D-boks
kun for de nærmeste skipene ved NÆR. Det er ytelsesgevinsten.

## Dekket (full parity)

- Skrog-farge per skipstype, mørkt-skip-styling (rød), heading-orientering.
- Trails (glødende, maks 60 pkt) — LOKAL/NÆR innenfor kvote.
- Navn-labels — LOKAL/NÆR innenfor kvote.
- 3D skrog-boks (dims + orientering + farge) ved NÆR.
- **Mørkt-skip-intelligens**: `dark`-flagg bakt i entiteten (fanges av delta-
  diffen på 30s-heartbeaten), `DarkShipsContext`-feed (aktive mørke + ghosts).
- **Ghosts**: mørke skip som forlot AIS rendres som falmede røde billboards.
- Popup/tooltip — identisk innhold i `shipPopup.ts`, inkl. sanctions-`enrichAsync`
  (OFAC SDN via IMO), MarineTraffic-lenke, `followEntityId`.
- Gate-crossings over store-deltaer (rå AIS-posisjon, stale-vern 2× batch).
- Replay-modus, mode-switch/cursor-jump-reset, GEOINT, kamera-«Følg».
- Klustring → GLOBAL-tetthetsceller (klikk zoomer).

## Bevisste avvik (utsatt — jf. flylagets 3D-modell-utsettelse)

Disse var NÆR-tier-dekorasjon og/eller dyre per-frame-effekter. De kan gjeninnføres
som eget NÆR-tier-lag senere:

- **Overbygnings-bokser** (lagvise `::c1..c7`) — kun 3D-hovedskrog beholdt.
- **Navigasjonslys** (rød/grønn/hvit sprites).
- **Radar-sweep** (roterende polyline).
- **Røykpartikler** (Cesium `ParticleSystem`, cap 60).
- **Kjølvann** (hvit ellipse bak bevegelige skip).
- **Ghost usikkerhets-ring** (voksende driftsradius) — ghost-billboard beholdt,
  ringen utsatt.
- **Per-heading/per-status bakt ikon** → nøytral silhuett + `billboard.rotation`
  + farge-tint (batchbart via delt atlas).

Ingen av avvikene rører intelligens-features (mørke skip, sanctions, ghosts,
gates) — kun visuell nær-detalj.
