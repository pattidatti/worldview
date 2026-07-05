# WorldView 2.0 — arkitektur- og designvisjon

> Konseptdokument. Ingen kode er endret som del av dette — dokumentet beskriver målbildet
> og en faset vei dit. Bakgrunn: ytelsesanalysen og -rundene på branch
> `claude/app-performance-analysis-j4tr4l` (juli 2026) som fjernet symptomene
> (tvungen kontinuerlig rendering, timer-stormer, fetch-hygiene, Firestore-lesekostnad).
> Dette er det strukturelle svaret.

## Målet

**Masse sanntidsdata på en nydelig globus — raskt, kult og elegant.**

Dagens arkitektur (35 lag som React-komponenter med side-effects + Cesiums Entity-API) var
riktig for å bygge mange lag fort, men er nå taket: React brukes som datapipeline, og
Entity-API-et som render-motor — begge er komfort-abstraksjoner som koster lineært med
datamengden.

## Nordstjerne (målbilde)

- **60 fps med 5 000–10 000 synlige objekter** (i dag: ~1–2k med hikke)
- **< 2 s til interaktiv globus** ved kald last
- **Idle = 0 rendrede frames** (requestRenderMode respekteres av alt)
- **Eleganse = riktig informasjonsmengde per zoomnivå** — ikke alt samtidig, men alltid noe vakkert

---

## Arkitektur: tre adskilte plan

Dagens mønster blander data, state og rendering i én React-komponent per lag. Målbildet
skiller tre plan med smale kontrakter:

### 1. Dataplan — utenfor React, i workers

- **`DataChannel`** per kilde (én klasse, ikke komponent): eier fetch/WS/poll-syklus,
  parser i web worker, og produserer **normaliserte deltaer** `{ upserts: T[], removes: id[] }`
  inn i en **`EntityStore`** (vanilla store med versjonsteller — ikke React-state).
- Tunge kanaler (fly, skip) poster posisjoner som **transferable `Float64Array`** —
  null kopiering, null GC-trykk.
- **Dead-reckoning flyttes til worker**: workeren ekstrapolerer og poster posisjonsbuffer
  @ 4 Hz; main thread bare skriver bufferen inn i primitives.
- Gjenbruk fra dagens kode: `usePollingData`-logikken (jitter, abort, overlap-guard —
  `src/hooks/usePollingData.ts`) blir en `PollScheduler`-klasse; `AISStreamConnection`
  (`src/services/aisstream.ts`) blir første WS-kanal; `feedParser.worker.ts` +
  `feedWorkerClient.ts` er kimen til worker-RPC-en.

### 2. Renderplan — imperativt, ingen React

- **`LayerRenderer`**-interface: `attach(scene)`, `sync(delta, storeVersion)`,
  `setLOD(tier)`, `pick(id)`, `detach()`. Renderere abonnerer direkte på EntityStore —
  ingen React i loopen.
- **Tunge lag renderes med primitive-collections**, ikke entities: `BillboardCollection`
  (ikoner), `PointPrimitiveCollection` (punkter), `PolylineCollection` (trails),
  `LabelCollection` (navn). Dette er 10–100× billigere per objekt enn Entity-API-et
  (ingen per-property-maskineri, én draw-batch per collection) og er hele forutsetningen
  for «masse data raskt».
- **Lette lag (< ~200 objekter) beholder dagens mønster** (`syncEntities` +
  `CustomDataSource`) — asteroider, vulkaner, ISS osv. er allerede billige.
- **Én `RenderScheduler`** eier `requestRender`: alle spredte kall (lag, fades, sveip,
  shaders) melder behov («kontinuerlig 30fps», «én frame», «dirty») til én instans som
  koalescer. Den delte fade-driveren (`src/utils/entityFade.ts`) foldes inn her.
- **Picking**: collections gir primitive-picking med `id`-felt → PopupRegistry-kontrakten
  beholdes uendret (builder får id + oppslag i EntityStore i stedet for Entity).

### 3. UI-plan — React, kun chrome

- React beholdes for det den er god til: paneler, popups, timeline, søk. Komponentene
  leser **aggregater** (counts, status, valgt entitet) fra stores via granulære
  selektorer — aldri rådata-arrays.
- `PopupRegistry`/`TooltipRegistry`-mønsteret, Zustand-storen (`src/store/layerStore.ts`)
  og `TimelineModeContext` sin cursor-store overlever som de er — de er allerede riktig tenkt.

---

## LOD- og budsjettsystem («Detail Governor»)

Kjernen i både ytelse og eleganse. I dag gjør ShipLayer/FlightLayer dette ad hoc
(`use3DRef`, `NAV_RANGE`, `DETAIL_RANGE_M`); det formaliseres:

- **Fire globale tiers** etter kamerahøyde:
  `GLOBAL` (> 5 000 km) → `REGION` (250–5 000 km) → `LOKAL` (25–250 km) → `NÆR` (< 25 km).
- **Deklarativ LOD-profil per lag** — hva som finnes per tier. Eksempel fly:
  - GLOBAL: tetthets-heatmap eller klustrede punkter (én tekstur, tusenvis av fly = én draw)
  - REGION: punkter/små ikoner, ingen labels, ingen trails
  - LOKAL: ikoner + trails + utvalgte labels
  - NÆR: 3D-modeller, full detalj
- **Sentralt budsjett**: maks N labels, M polylines, K partikkelsystemer totalt —
  nærmest-kamera vinner. Governor deler ut kvoter; renderere holder seg innenfor.
- Dette er den visuelle pyramiden som gjør at «masse data» ser kuratert ut i stedet for
  rotete — og at frame-kostnaden er begrenset uansett hvor mye data som strømmer inn.

---

## Visuelt språk (kult + elegant)

- **Ett ikon-atlas**: alle lag-ikoner (type × farge × state) genereres til én tekstur ved
  oppstart; primitives refererer subregioner. Erstatter hundrevis av individuelle
  data-URI-SVGer → GPU-batching fungerer, og all ikonografi tegnes i samme stil
  (strøkvekt, glow, hjørneradius).
- **Ett bevegelsesspråk**: all inn/ut-animasjon gjennom den delte animasjonsdriveren
  (fade/bounce/pulse med samme easing og varighet). Ingen komponent lager egne løkker.
- **Fargesystemet** beholdes i CSS-variablene (`src/index.css`) som eneste kilde —
  eksporteres programmatisk til atlas og primitives, så kart og UI alltid matcher.
- **Scener/presets i stedet for 35 toggles**: kuraterte utgangspunkt — «Maritim»,
  «Luftrom», «Geopolitikk», «Natur», «Infrastruktur» — hver med lagkombinasjon,
  kamerastart og LOD-profil. Lagpanelet degraderes til «avansert»-modus. Dette er det
  største enkeltgrepet for opplevd eleganse: appen åpner med et vakkert, meningsfullt
  bilde i stedet for et tomt kart og en meny.
- **Effekter (shaders)** beholdes som signatur-feature, drevet av RenderScheduler @ 30 fps,
  og kan kobles til scener (f.eks. thermal i «Geopolitikk»-natt).
- **Beholdes urørt**: HUD-estetikken, frosted-glass-panelene (nå uten blur-kostnad),
  EntitySelector-brackets, GateDrawing — dette er identiteten.

---

## Migreringsstrategi — appen funker hele veien

- **Fase A — Fundament** (ingen lag migreres): `EntityStore`, `DataChannel`,
  `RenderScheduler`, `ViewportService` (én kamera-subscription som erstatter ~14
  `useViewport`-instanser), `LODGovernor`, ikon-atlas-generator. Alt nytt lever ved
  siden av gammelt.
- **Fase B — Bevisfasen: FlightLayer** migreres til kanal + primitive-renderer.
  Akseptansekriterium: 2 000 fly med trails @ 60 fps, dead-reckoning i worker,
  picking/popup/gates fungerer. Går dette, går alt.
- **Fase C — ShipLayer** (mest komplekse): skrog/overbygg/lys/kjølvann/røyk blir
  LOD-tiers i rendereren i stedet for 15 entiteter per skip.
- **Fase D — Punktlagene forenes**: earthquakes, news, conflicts, disasters, volcanoes,
  launches m.fl. blir **konfigurasjon på én felles `PointLayerRenderer`** (ikon, farge,
  klustring, LOD-profil, popup-builder) — ti lag blir data, ikke kode. Størst kodereduksjon.
- **Fase E — Scener + polish**: preset-system, åpningsscene, atlas-finpuss, bevegelsesspråk.
- **Fase F — Opprydding**: fjern `LayerContext`-shim, død kode (StatusTicker), gamle
  lag-komponenter, oppdater CLAUDE.md/DESIGN.md.

Hver fase er shippbar; gamle og nye lag sameksisterer (CustomDataSource og collections
lever fint side om side i samme scene).

## Bevisste valg / trade-offs

- **Cesium beholdes.** deck.gl/MapLibre ville gitt billigere 2D-datalag, men mister ekte
  3D-globe, terreng og ion-økosystemet — som er sjelen i appen. Riktig svar er å bruke
  Cesiums raske sti (primitives), ikke bytte motor.
- **Primitives koster bekvemmelighet**: ingen gratis property-interpolasjon, manuell
  picking-mapping, manuell z-ordering. Betales én gang i `RendererBase`, gjenbrukes av alle.
- **To mønstre i overgangen** er akseptabelt og midlertidig; lette lag kan forbli på
  Entity-API-et permanent.
- **Firebase/replay-arkitekturen** røres ikke av dette — replay kobles på EntityStore som
  enda en DataChannel (historiske buckets → samme delta-format), som faktisk *forenkler*
  dagens doble kodegrener i FlightLayer/ShipLayer.

## Målekriterier

Defineres som akseptansetester når fase B bestilles:

- DevTools Performance-trace: 2 000 fly med trails @ 60 fps
- Idle-scene = 0 rendrede frames (requestRenderMode)
- Kald last < 2 s til interaktiv globus
- Lighthouse-perf før/etter per fase
