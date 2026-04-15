# WorldView — Fasert implementasjon: Porter, analyse-paneler, tidslinje

Inspirert av MapTheWorld.ai (Gemini-analyse av YouTube-video). Tre permanente features levert i avhengighetsrekkefølge, ikke verdi-rekkefølge.

## Kontekst

MapTheWorld-demoen viste fire kjerneideer verdt å stjele: scrubbar tidslinje med hastighetskontroll, synkronisert dataflyt på tvers av alle paneler, delta-vs-baseline ("−92%"-feltet), og geofencing-gates som genererer "crossing events". WorldView har allerede mye av den taktiske estetikken (HUD, shaders, status-ticker), men mangler det analytiske laget: ingen persistent historikk, ingen hendelsesstrøm, ingen brukerdefinerte instrumenter.

**Skala-forutsetning:** pattidatti + <10 venner. Optimaliseringer som antyder større skala er utsatt til målt behov. Ingen mobilstøtte — UI designes for desktop og skjules under breakpoint hvis nødvendig.

**Historikk-status i dag:** FlightLayer holder `trailHistoryRef` (40 posisjoner/fly), ShipLayer holder 60 pos/skip. Disse er **live, in-memory, kortlivede** — går tapt ved reload og dekker ikke replay-behov. SatelliteLayer har ingen trails; TLE-propagering er deterministisk. Ingen event-buss finnes. EventLog er ephemeral count-delta (maks 12 items) og ikke egnet som strukturert hendelseskilde.

Derfor fases arbeidet slik:
1. **Porter først** fordi de produserer hendelsesstrømmen som (2) og (3) konsumerer. Minst blast radius — kun klient, ingen server.
2. **Analyse-paneler andre** fordi dette er den billigste valideringen av rolling buffers + Firestore-snapshot-kadens før vi overkommitter til (3).
3. **Tidslinje sist** fordi server-basert delt historikk er dyrest: Firestore read-kostnader, schema-versjonering, replay-modus-reconciliation, Cloud Function + trail-rekonstruering konsentreres her.

**Hvorfor server-basert delt historikk (ikke IndexedDB):** Bruker valgte global delt historikk — én autoritativ kilde som alle brukere ser samme fortid fra. IndexedDB-kvote ~50MB praktisk, overlever ikke enhetsbytte, kan ikke backfilles mens appen er lukket, og gir ikke delt view.

**Firebase-bootstrap:** Settes opp fra bunn i worldview (ingen eksisterende config her). Initialiserings-mønster gjenbrukes fra søsterprosjektet `astro/src/firebase.js`, auth-mønster fra `astro/src/auth.js`. Region: `eur3` (Firestore) og `europe-west1` (Functions, Node 22) — matcher søsterprosjekter. Auth-modell: **Google sign-in** fra fase 2 (ikke anonym) — identitet persisterer på tvers av enheter, slik at porter og paneler overlever laptop-bytte.

**Hvorfor Firestore (ikke Postgres):** ~500–2000 entiteter per snapshot for 6 relevante lag, ~144 docs/dag/lag med 10-min bucket. <10 brukere betyr lav read-kost. Hovedrisiko er *read*-kostnad ved scrubbing — adresseres med caching (fase 3).

Hver fase er uavhengig shippbar. Stopp etter fase 1: fungerende geofencing. Stopp etter fase 2: fungerende analytikk. Fase 3 krever fase 2.

## Kritiske filer

Eksisterende filer som berøres på tvers av fasene:

- `src/App.tsx` — mount-punkt for alle providere og komponenter
- `src/context/LayerContext.tsx` — layer-ID-union, count-rapportering
- `src/components/Layers/FlightLayer/FlightLayer.tsx` — crossing-deteksjon leser `trailHistoryRef`; replay-modus
- `src/components/Layers/ShipLayer/ShipLayer.tsx` — crossing-deteksjon leser `trailHistoryRef`; replay-modus
- `src/components/Layers/ChokepointLayer/ChokepointLayer.tsx` — polyline-mønster å gjenbruke
- `src/components/UI/WeatherRadarControls.tsx` — styling-referanse for play/pause/speed
- `src/components/UI/MissionControl.tsx` — **kun visuell styling-referanse** for flytende panel. Den er IKKE draggable; `useDrag`-hook må bygges fra scratch i fase 2.
- `src/hooks/useViewport.ts` — bbox, viewport-aware fetch
- `src/hooks/useHoverTooltip.ts` — ScreenSpaceEventHandler-mønster
- `CLAUDE.md` — dokumentasjon må oppdateres per fase

---

## Fase 1 — Porter + crossing events + TimelineEventContext-skjelett

**Estimat:** ~1,5 uker. Ren klient-feature. Ingen backend-avhengighet. (Oppjustert fra ~1 uke fordi `GateNameModal` må bygges fra scratch, vitest-tester legges til, og empty/error-states designes eksplisitt.)

### Brukerverdi

- Ny "Porter"-rad i LayerPanel med visibility-toggle og "Tegn port"-knapp.
- Draw-mode: fadekrysset cursor, klikk-klikk for å legge til vertex, dobbeltklikk/Enter fullfører, Escape avbryter.
- Modal "Navn på port" ved fullføring; lagres i localStorage.
- Porter rendres som blå polyliner (`--color-gates` ny CSS-variabel) med svak glow.
- Ny høyre-dokket "Porter"-panel: liste med navn, kryssinger siste 24t, visibility-toggle, omdøp, slett.
- Hvert fly/skip-poll kjører linje-segment-intersection mot synlige porter. Kryssing emitterer event.
- Events akkumuleres i bounded in-memory queue (cap 1000, LIFO). Ingen UI-timeline ennå — bare telling.
- Teller blinker når ny kryssing kommer.
- **Tastatur:** `G` starter draw-mode, `Enter` fullfører, `Escape` avbryter, `Backspace` fjerner siste vertex. `KeyboardHelpModal` får ny "Porter"-seksjon.
- **Onboarding:** Første gang "Porter"-laget togglas på, vises toast: "Trykk G eller 'Tegn port'-knappen for å starte. Se `?` for alle snarveier." Styres av localStorage-flagg `gates_onboarding_seen`.
- **Empty states:**
  - `GatePanel` uten porter: "Ingen porter enda. Trykk 'Tegn port' for å starte."
  - Per-port-rad ved 0 kryssinger 24t: "— (ingen aktivitet)".
  - Draw-mode med <2 vertekser ved Enter: toast "Port må ha minst 2 punkter".

### Nye filer

- `src/context/GateContext.tsx` — gate CRUD + localStorage. `{ gates: Gate[], addGate, updateGate, removeGate, toggleVisibility, isDrawing, startDrawing, cancelDrawing, finishDrawing }`.
- `src/context/TimelineEventContext.tsx` — bounded queue (1000). `{ events, append, clear }`. **Vanlig React Context + `useState<TimelineEvent[]>`** — ikke `useSyncExternalStore`. For 1000 events med 1-2 konsumenter er dette fint. Oppgrader hvis profiler viser problem.
- `src/types/gate.ts` — `Gate = { id, name, vertices: Array<{lat,lon}>, color, visible, createdAt }`.
- `src/types/timeline-event.ts` — discriminated union: `{ kind: 'gate-crossing' | 'layer-alert' | 'data-gap', id, timestamp, ... }`.
- `src/components/Layers/GateLayer/GateLayer.tsx` — side-effect layer, rendrer porter som Cesium Entity med polyline-property. Følger Map<id, Entity>-sync-mønsteret fra eksisterende lag. Eier også ScreenSpaceEventHandler for draw-mode.
- `src/components/Layers/GateLayer/useGateDrawing.ts` — draw-mode hook med preview-polyline via CallbackProperty.
- `src/utils/geofence.ts` — `segmentsIntersect(a1,a2,b1,b2)`, `bearing(from, to)`, `crossingDirection(prev, curr, gate): 'left-to-right' | 'right-to-left'`, `haversineKm(a, b)`.
- `src/utils/crossingDetector.ts` — pure function: `detectCrossings(prev: Map<id,pos>, curr: Map<id,pos>, gates: Gate[], entityType): GateCrossing[]`.
- `src/components/UI/GatePanel.tsx` — høyre-dokket liste. Styling-mønster som LayerPanel.
- `src/components/UI/GateDrawHud.tsx` — HUD under draw-mode: "Klikk for å legge til punkt · Dobbeltklikk for å fullføre · Esc for å avbryte". Posisjonert som WeatherRadarControls.
- `src/components/UI/GateNameModal.tsx` — dialog for navngiving + validering av segmentlengder. **Bygges fra scratch etter `KeyboardHelpModal`-mønsteret** (~80 linjer: fixed overlay z-50, stopPropagation, Escape-handler). Ingen generisk modal-komponent finnes i kodebasen i dag.

### Endringer i eksisterende filer

- `src/App.tsx` — wrap i `<GateProvider>` og `<TimelineEventProvider>` (inni LayerProvider, utenfor GlobeViewer). Mount `<GateLayer />`, `<GatePanel />`, `<GateDrawHud />`.
- `src/context/LayerContext.tsx` — legg til `'gates'` i layer-ID-union.
- `src/types/layers.ts` — registrer gate layer ID med default i LAYER_DEFAULTS.
- `src/components/UI/LayerPanel.tsx` — gates-rad med ekstra "Tegn port"-knapp.
- `src/components/Layers/FlightLayer/FlightLayer.tsx` — **crossing-deteksjon leser eksisterende trails**: `prev = trailHistoryRef.current.get(icao24)?.at(-2)`, `curr = .at(-1)`. Før entity-sync, kjør `detectCrossings(prev, curr, gates, 'flight')` per entitet og push til TimelineEventContext. Ingen `DrState`-utvidelse.
- `src/components/Layers/ShipLayer/ShipLayer.tsx` — samme mønster, keyed på mmsi, leser `trailHistoryRef`.
- `src/index.css` — `--color-gates` (blå, matcher MapTheWorld).

### Gjenbruk

- `src/context/ViewerContext.tsx` — viewer-tilgang for ScreenSpaceEventHandler.
- `src/context/PopupRegistry.tsx` — registrer popup-builder: "Port: {navn} · {count} kryssinger 24t · Slett / Omdøp".
- `src/context/TooltipRegistry.tsx` — hover-tooltip viser navn.
- `src/components/Layers/ChokepointLayer/ChokepointLayer.tsx` — referanse for polyline-oppretting + `Cartesian3.fromDegreesArray`.
- `src/components/UI/WeatherRadarControls.tsx` — styling-mønster for GateDrawHud.
- `src/hooks/useHoverTooltip.ts` — ScreenSpaceEventHandler-oppskrift.

### Tekniske beslutninger

1. **Polyline, ikke polygon.** MapTheWorld bruker polyliner. Enklere matematikk (segment–segment), direksjonell ("inn/ut"). Tradeoff: kan ikke uttrykke "inni region X".
2. **Intersection-tester i hvert lag, ikke sentralt.** Ingen global entity-store finnes. Sentralisering ville duplisere state-tracking.
3. **Ny TimelineEventContext, ikke utvid EventLog.** EventLog er 12-item count-delta. Her trengs 1000-item strukturert event-stream. Overlapp kan håndteres via tynt adapter senere.
4. **Enkel React Context + useState**, ikke `useSyncExternalStore`. Premature optimization er fienden. Bytte pattern er trivielt hvis React DevTools Profiler viser problem med 1000 events.
5. **Gate-matematikk med harde invarianter** (erstatter tidligere udokumentert "<10m feil"-påstand):
   - **Regel 1 — Maks 100 km per segment.** Ved `finishDrawing`, hver segmentlengde valideres via haversine. Overskridelse → `GateNameModal` viser advarsel "Segment {n} er {X} km — splitt i mindre segmenter" og tilbyr **auto-splitt** (lineær interpolasjon i lat/lon, N=`ceil(length/100)` delsegmenter).
   - **Regel 2 — Tangent-plan intersection per segment.** Projiser `prev`, `curr`, `gateA`, `gateB` til lokalt ENU-plan rundt segment-midpunkt. 2D segment-segment-intersection der. Ved 100 km grense er cos-feilen <0.4 m (100/6371 ≈ 1.6e-2 rad, (1-cos)/2 ≈ 1.2e-4) — godt under ADS-B- (±5m) og AIS-støy (±10m).
   - **Regel 3 — Avvis poler og antimeridian.** Hvis |lat| > 80° eller gate krysser lon ±180°: modal "Porter støttes ikke nær polene eller datolinjen". Enklere enn å håndtere wraparound riktig.
6. **localStorage-schema:** `{ version: 1, gates: Gate[] }`. Version-felt fordi polygon-porter kan komme senere. **Merk:** I fase 2 flyttes gates til Firestore globalt — localStorage fungerer da kun som offline-cache/fallback.
7. **Per-port bbox-klipping utsettes.** Kun hvis målt som flaskehals i fase 2.
8. **Trail-timestamps passes separat (kritisk).** `trailHistoryRef` er `Map<id, Cartesian3[]>` uten tidsinfo. `detectCrossings(prev, curr, prevTs, currTs, gates, type)` mottar poll-wall-clock-ts som separate argumenter og interpolerer crossing-tid lineært: `ts = prevTs + fraction × (currTs - prevTs)`. Trail-strukturen utvides IKKE (for å unngå blast radius på trail-rendering som kun leser posisjoner).
9. **Stale-trail-vern.** Crossing-detektor ignorerer hvis `currTs - prevTs > 2 × pollMs` (20s for fly, 10s for skip). Forhindrer falske crossings fra trails som står etter layer-toggle-off/på, eller fra entiteter som droppet en poll på grunn av nettverks-hikke.
10. **Draw-mode suspenderer hover og entity-seleksjon.** `GateContext.isDrawing` leses av `useHoverTooltip` og `PopupRegistry` — når `true`: ignorer MOUSE_MOVE og LEFT_CLICK på globus-entiteter. Forhindrer at vertex-klikk trigger tooltip eller entity-valg.

### Tester

Fase 1 introduserer `vitest` i prosjektet (ikke tidligere konfigurert). Tester er obligatoriske for matematikk-kjernen og må være grønne før fase 1 merges.

- `npm install --save-dev vitest @vitest/ui`
- `package.json` scripts: `"test": "vitest"`, `"test:ui": "vitest --ui"`
- `src/utils/__tests__/geofence.test.ts` — 15–20 cases for `segmentsIntersect`, `haversineKm`, `bearing`, `crossingDirection`, inkludert grensetilfeller (identiske punkter, parallelle segmenter, antimeridian-avvisning).
- `src/utils/__tests__/crossingDetector.test.ts` — mock prev/curr maps + gates + ts, asserter korrekt event-stream inkl. stale-trail-vern (punkt 9).

### Verifikasjon

1. Tegn port på innflyvningen til OSL. Vent ~20s (≥2 × poll-intervall = 2 × 10s). Console-logg viser kryssing, count øker.
2. Tegn port på Oslofjorden. Skip-kryssing innen ~10s (≥2 × 5s batch-kadens).
3. Tegn port Oslo–Bergen (~300 km) i én klikk-klikk → modal varsler "Segment 1 er 305 km" med auto-splitt-forslag (3 delsegmenter).
4. Reload → porter persisterer.
5. Tøm localStorage → porter forsvinner, ingen krasj.
6. Misformet port (ett klikk + Escape) → ingen artefakt.
7. Skjul port → polyline borte, kryssing teller fortsatt stille (hiding ≠ instrument-pause).
8. Forsøk tegn port nær Nordpolen → modal avviser.
9. Devtools minne-snapshot etter 10 porter + 500 fly stress → TimelineEventContext ≤ 1000 events.

---

## Fase 2 — Analyse-paneler (delta + trend) + Firebase-plumbing

**Estimat:** ~1,5 uker. Første Firebase-integrasjon.

### Brukerverdi

- Ny "Analyse"-knapp i TopBar åpner meny: "Legg til Delta-panel", "Legg til Trend-panel", "Skjul alle".
- Hvert panel er flytende, draggable, resizable overlay-kort (MissionControl-stil) bundet til et lag eller en port.
- **Delta-panel** (per lag): nåværende count, delta vs 1t/24t/7d snitt, sparkline siste 6t. Delta farget grønn/rød.
- **Trend-panel** (per port): enkel linje, kryssinger per 15-min bucket siste 24t. Retningssplit er fase 2.5 — dropp nå.
- Panelposisjoner + konfig persisterer i localStorage.
- Etter ~1 min: in-memory buffer gir grunnlag. Etter Firestore-restore (~2s ved reload): historiske baselines.
- **Empty / loading / error states:**
  - `DeltaPanel` før 60s baseline er akkumulert: "Samler baseline… 42s" med progress-animasjon.
  - `DeltaPanel` ved Firestore-feil: "Historikk utilgjengelig — viser kun live" (panel fungerer, men uten 24t/7d).
  - `TrendPanel` ved 0 crossings siste 24t: "Ingen kryssinger siste 24t — prøv en travlere port."
  - `SignInGate` ved auth-feil (popup blokkert): fallback-knapp "Logg inn (redirect)" + hjelpetekst.

### Lag-skop for snapshots (viktig avklaring)

Kun 6 av 29 lag får Firestore-snapshot-writes:

- **Bevegelige (entity-snapshots):** `flights`, `ships`.
- **Satellittene** propageres deterministisk fra TLE — ingen Firestore-writes. Replay rekonstruerer fra live TLE-cache i klient.
- **Events (event-stream):** `conflicts`, `disasters`, `news`.

Værradar, asteroider, trafikk og resten får **ingen** historikk-writes i fase 2/3. De kan delta i live Delta-panel (count nå vs avg fra in-memory buffer), men ikke trend-panel eller replay. Dokumenteres eksplisitt i CLAUDE.md.

### Gates + crossings-skop (globalt delt)

**Både gater og crossings er globale** — alle innloggede brukere ser hverandres porter og kryssinger. Dette matcher ambisjonen om "én autoritativ kilde" og løser navne-paradokset (hvis gater var private men crossings globale, ville andre sett meningsløse gateId-referanser).

- Gater migreres fra localStorage til Firestore: `/gates/{gateId} = { name, vertices, color, ownerUid, createdAt, visible, schemaVersion }`. localStorage beholdes som offline-cache/fallback med samme schema.
- Crossings ligger på `/gate_crossings/{YYYY-MM-DD_UTC}/events/{gateId}_{entityId}_{tsMinute}` som før.
- **Security rules:** Alle autentiserte brukere leser både `/gates` og `/gate_crossings`. Kun eier (`request.auth.uid == resource.data.ownerUid`) kan skrive/slette egen gate. Crossings kan skrives av enhver autentisert klient (deduplikering via doc-ID).
- **Visibility-toggle forblir per-bruker** (localStorage), uavhengig av Firestore-doc. Å skjule en gate påvirker kun eget view.

### Nye filer

- `src/context/HistoryContext.tsx` — rolling snapshot buffer. Hvert 60s: snapshot `LayerContext.counts` + gate-crossing-rates. Intern struktur: `TimelineEvent[]` + `useState`. Typed arrays utsettes til målt GC-trøkk.
- `src/services/firestore.ts` — Firebase init. `db`, `auth` eksport. Leser `VITE_FIREBASE_*` env. Initialiserings-mønster gjenbrukes fra `astro/src/firebase.js`.
- `src/context/AuthContext.tsx` — `{ user, loading, signIn, signOut }`. Wrapper over Firebase Auth. `signIn()` bruker `signInWithPopup(new GoogleAuthProvider())` med redirect-fallback (mønster fra `astro/src/auth.js`).
- `src/context/GateSyncContext.tsx` — syncer `GateContext` mot Firestore `/gates`. `onSnapshot`-listener populerer lokalt cache, lokale mutasjoner skriver gjennom til Firestore og oppdaterer localStorage som fallback.
- `src/components/UI/SignInGate.tsx` — full-screen overlay med logo + "Logg inn med Google"-knapp. Vises når `auth.currentUser == null`. Blokkerer all UI-tilgang. ESC gjør ingenting (ingen close uten sign-in).
- `src/components/UI/SignOutButton.tsx` — lite avatar + dropdown i TopBar (ved klokke). Viser brukerens navn/bilde + "Logg ut".
- `src/services/historySync.ts` — `writeSnapshot(snapshot)`, `readRange(fromTs, toTs, layerId?)`. Batcher writes (hvert 5. min). På app-start: les siste 7d inn i HistoryContext.
- `src/hooks/useRollingStats.ts` — `{ current, avg1h, avg24h, avg7d, delta1h, delta24h, delta7d }` for layer ID.
- `src/hooks/useGateTrend.ts` — bucketed crossings per port.
- `src/hooks/useDrag.ts` — **ny fra scratch** (~30-40 linjer). MissionControl har ikke draggable; vi bygger en enkel pointer-events-basert hook gjenbrukt av alle paneler.
- `src/components/UI/AnalysisPanel/AnalysisPanelFrame.tsx` — generisk draggable/resizable frame. Header, close, drag-handle, persistence-key. Bruker `useDrag`.
- `src/components/UI/AnalysisPanel/DeltaPanel.tsx` — delta-tall + sparkline.
- `src/components/UI/AnalysisPanel/TrendPanel.tsx` — port-trend chart.
- `src/components/UI/AnalysisPanel/AnalysisMenu.tsx` — dropdown.
- `src/components/UI/AnalysisPanel/Sparkline.tsx` — håndrullert inline SVG `<polyline/>`.
- `src/types/history.ts` — snapshot-typer, Firestore doc-typer.
- Root: `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`.

### Firebase-oppsett (engangsoperasjon)

```bash
firebase login
firebase use --add worldview-<prosjekt>   # opprett/velg prosjekt, alias 'default'
firebase init firestore                    # rules + indexes, region: eur3
firebase init functions                    # (fase 3) Node 22, TypeScript, europe-west1
```

Etter init:
- **TTL-policy opprettes manuelt** via Firebase Console → Firestore → TTL-tab (CLI støtter ikke TTL). Pek på `expiresAt` per kolleksjon: `snapshots`, `entities`, `gate_crossings`.
- **Composite indexes** defineres eksplisitt i `firestore.indexes.json` før `firebase deploy --only firestore:indexes`:
  - `gate_crossings/{day}/events`: `gateId ASC, ts DESC`
  - `entities/{type}/buckets`: `ts ASC`
- **Auth**: aktiver Google-provider i Firebase Console → Authentication → Sign-in method.
- **Billing-alert** settes til 1 USD/dag i Firebase Console → Usage.

### Endringer

- `src/App.tsx` — wrap i `<AuthProvider>` (ytterst) og `<HistoryProvider>`. Mount `<SignInGate />` (overlay som blokkerer når ikke innlogget) og `<AnalysisPanelHost />` som administrerer panel-array og renderer hver som portal.
- `src/context/GateContext.tsx` — oppdateres til å lese/skrive gjennom `GateSyncContext` (Firestore-backed). localStorage beholdes som offline-fallback.
- `src/components/UI/TopBar.tsx` — "Analyse"-knapp + `SignOutButton` (avatar-dropdown ved klokke).
- `src/context/TimelineEventContext.tsx` — legg til `crossingsForGate(gateId, fromTs, toTs)` memoized selector.
- `.env.example` — `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`.
- `package.json` — add `firebase` (klient-SDK) og `uplot`.
- `CLAUDE.md` — ny "Firebase"-seksjon: region (eur3/europe-west1), Google sign-in-flow, schemaVersion-regler (lese + skrive), gates/crossings globalt skop, env-vars, UTC-tidssone, snapshot/replay-modell, lag-skop for historikk.

### Gjenbruk

- `src/context/LayerContext.tsx` — `counts` er input til hver snapshot. Ingen endring.
- `src/hooks/useViewport.ts` — brukes av snapshot-collector om vi senere legger til viewport-scope counts.
- `src/components/UI/MissionControl.tsx` — **visuell** styling-referanse. Ingen draggable-logikk å stjele.
- `src/context/PopupRegistry.tsx` — TrendPanel kan registrere click-on-bar → popup.

### Tekniske beslutninger

1. **Chart-bibliotek: uPlot, ikke Recharts.** Recharts ~130KB min+gz, treg på 10k punkter. uPlot 45KB, raskest JS-charting. Tynt React-wrapper (~40 linjer). Sparklines er håndrullert inline SVG — skarpere enn biblioteks-output.
2. **Rolling buffer: `TimelineEvent[]` + `useState`**, ikke typed arrays. Maks ~1440 snapshots × 6 lag = 8640 objekter. GC er ikke-problem på desktop. Typed arrays introduseres hvis `performance.measure` viser GC-pauser >5ms.
3. **Firestore-schema:**
   ```
   /snapshots/{YYYY-MM-DD_UTC}/entries/{epochMinute}
     = { ts, expiresAt, counts: { flights, ships, ... } }
   /entities/{entityType}/buckets/{YYYY-MM-DD_UTC}_{10minBucket}
     = { ts, expiresAt, schemaVersion, items: Entity[] }
   /gate_crossings/{YYYY-MM-DD_UTC}/events/{crossingId}
     = { ts, expiresAt, gateId, entityId, entityType, direction, position }
   ```
   Daglige kolleksjoner = query-skop + batch-sletting. **TTL er per-field**: `expiresAt: Timestamp (now + 30d)` på hvert doc, med én TTL-policy per kolleksjon som peker på dette feltet. Alle datoer er **UTC** (dokumenteres i CLAUDE.md).
4. **Auth**: Google sign-in via `signInWithPopup(new GoogleAuthProvider())`. Fallback til `signInWithRedirect` ved popup-blokkering (mønster fra `astro/src/auth.js`). `SignInGate` blokkerer all UI til innlogget. Identitet persisterer på tvers av enheter. Firestore security rules krever `request.auth != null` for all read/write, og `request.auth.uid == resource.data.ownerUid` for writes på `/gates`.
5. **Budget + kost-kontroll**:
   - Budget-alert i Firebase Console: 1 USD/dag (dokumenteres i CLAUDE.md).
   - Security rules: per-UID rate-limit via Firestore-basert counter på `/rateLimits/{uid}` (~60 writes/min).
   - Remote kill-switch: `/config/killSwitch` doc som klient leser på boot; hvis `disabled: true` → les-only modus med toast-varsel.
6. **Reconciliation med fase 1 in-memory:** Gate-crossings skrives *også* til Firestore i fase 2. In-memory fortsetter som low-latency cache; Firestore er source-of-truth. På reload: HistoryContext backfiller in-memory fra Firestore (siste 24t). Deterministiske `{gateId}_{entityId}_{tsMinute}` doc-IDs = idempotens.
7. **Charts utenfor tidslinjen, ikke inni.** Tidslinje-baren (fase 3) er 44px — ingen plass. Flytende paneler lar bruker stable flere.
8. **Baseline-matematikk:** "24t snitt" = mean av siste 1440 min-samples ekskl. 5-min leading edge (unngå self-correlation). "7d snitt" = siste 10080 ekskl. siste 60 min.
9. **Panel-state:** `localStorage.analysisPanels = [{id, type, layerId|gateId, position, size}]`. Separat nøkkel fra porter.
10. **Snapshot-kadens:** start 10 min for alt. Variabel kadens (1 min for skip i havn) utsettes til målt behov.
11. **Cloud Function aggregator utsatt** — fjernet fra fase 2. Nevnes som fase 3-risiko hvis read-kost eskalerer.
12. **Panel-kaskade og maks-tak:** Nye AnalysisPanels kaskaderes `+24px/+24px` fra forrige åpne panel. Max 8 samtidig åpne; å åpne et 9. lukker det eldste med toast "Eldste panel lukket". Paneler re-klampes til viewport ved window-resize.
13. **Schema-versjonering dekker både lesing og skriving.** Alle history-writes inkluderer `schemaVersion: CURRENT_SCHEMA`. Security rule avviser writes uten felt eller med eldre versjon: `request.resource.data.schemaVersion == 2`. Dette forhindrer at utdaterte klienter skriver formatet dekadent mens nyere klienter leser. Migratorer (fase 3) kjører fortsatt ved lesing for historiske docs.
14. **UTC i storage, lokal i UI.** Firestore-doc-IDer bruker `YYYY-MM-DD_UTC`. `DatePicker` viser lokal tid (nb-NO locale) men konverterer til UTC før query. Dokumenteres eksplisitt i CLAUDE.md.

### Verifikasjon

1. Kjør appen 5 min → Delta-panel viser non-zero deltas.
2. Reload → Firestore-restore → Delta viser 24t+ historikk.
3. Offline → paneler fungerer fra in-memory; online → writes gjenopptas; ingen dup-entries.
4. Tegn port, vent 15 min, la fly krysse → Trend-panel viser non-zero bars.
5. Firestore-konsoll: ~144 docs/dag under `/snapshots/{today_UTC}/entries/`.
6. Stress: 5 Delta + 3 Trend paneler åpne → frame time <16ms.
7. Resize browser → paneler re-klampes til viewport. Drag fungerer via `useDrag`.
8. Slett port → trend-panel auto-lukker med toast "Port slettet — panel fjernet".
9. Forsøk skrive til Firestore uten auth → security rules avviser.
10. Logg ut og inn igjen → paneler + gater henter opp igjen fra localStorage/Firestore uten tap.
11. Forsøk skrive gate med feil `ownerUid` → security rules avviser.
12. Klient med `schemaVersion: 1` prøver skrive til v2-kolleksjon → avvist av rule.
13. Åpne 9 paneler → det eldste lukkes automatisk, toast vises.

---

## Fase 3 — Tidslinje-scrubber + playback

**Estimat:** ~2 uker. Mest kompleks. Avhenger av fase 2-plumbing.

### Brukerverdi

- Full-bredde bar over StatusTicker på `bottom-[36px]`, `z-11`. Frosted glass, 44px høy.
- Venstre: "LIVE" pill (grønn) eller "REPLAY" pill (oransje), modus-toggle.
- Senter: scrubbar timeline med fargede prikker — gate-crossings (per-port-farge), layer-error-alerts (rød), data-gap-markers (grå). Drag endrer tid. Siste 24t default.
- Høyre: hastighets-knapper (`PAUSE`, `30m/s`, `2t/s`, `6t/s`), "Hopp til nå"-knapp, date-picker for vilkårlig dag.
- Replay-modus: pauser live polling, henter historiske snapshots fra Firestore, rendrer entiteter på cursor-tid. Animeres mellom nabobuckets ved valgt hastighet.
- Hover på prikk: "14:32 · Port Nord → 2 fly inn".
- "Hopp til nå": myk crossfade tilbake til live uten flicker.
- **Empty / error states:**
  - "Hopp til nå" mens Firestore er nede: viser live uten crossfade, toast "Koblet til live — historikk utilgjengelig".
  - Drag cursor utenfor TTL-range (>30d): cursor snapper til eldste tilgjengelige bucket, toast "Data slettet etter 30 dager".
  - Cloud Function nede 2t: data-gap render som grå område i timeline med tooltip "Ingen data 14:20–16:20".
  - Disconnect under replay: toast "Historikk ikke tilgjengelig", cursor fryser grasiøst.
- **Onboarding:** Første gang bruker klikker REPLAY: toast "Drag i baren for å scrolle. Space = pause. Se `?` for snarveier." Styres av `replay_onboarding_seen`-flagg.

### Nye filer

- `src/context/TimelineModeContext.tsx` — `{ mode: 'live'|'replay', cursor: number, speed: 0|30|120|360, setMode, setCursor, setSpeed }`.
- `src/components/UI/Timeline/TimelineBar.tsx` — komponerer underkomponenter.
- `src/components/UI/Timeline/TimelineTrack.tsx` — scrubbar track.
- `src/components/UI/Timeline/EventMarkers.tsx` — prikker fra TimelineEventContext + HistoryContext.
- `src/components/UI/Timeline/PlaybackControls.tsx` — speed buttons + pill.
- `src/components/UI/Timeline/DatePicker.tsx` — native `<input type="date">` med nb-NO locale.
- `src/services/historyReplay.ts` — `fetchEntitySnapshots(entityType, fromTs, toTs)` returnerer iterator `{ ts, entities }`. Pagination + caching.
- `src/hooks/useReplayEntities.ts` — `(entityType, cursorTs, speed)` → `{ entities, trails }`. Trails beregnes fra siste N=6 snapshots (60 min ved 10-min kadens) allerede i replay-cache.
- `src/utils/entityInterpolation.ts` — lerp position + bearing mellom to snapshots. Identity-matching: entitet i A men ikke B → fade out.
- `src/utils/historyCache.ts` — LRU cache `{entityType}:{10minBucket}`. In-memory only. IndexedDB andre-lag utsatt.
- `functions/src/snapshotWorker.ts` — **Cloud Function (scheduled, hvert 10 min)** som puller fra airplanes.live + aisstream + eonet + gdelt + acled og skriver autoritativ snapshot.
- `functions/src/sources/` — tynne, server-side fetchere per kilde. Deler **kun typer** med klient (fra `src/types/`), ikke fetch-kode. ~300 duplikatlinjer total — akseptabelt for <10 brukere.
- `functions/src/schemaVersion.ts` — `{ schemaVersion }` på hvert history-doc.
- `src/utils/schemaMigrators.ts` — migrator-registry, migrerer ved **lesing**.

### Endringer

- `src/App.tsx` — wrap i `<TimelineModeProvider>`. Mount `<TimelineBar />`.
- `src/components/Layers/FlightLayer/FlightLayer.tsx` — les `TimelineModeContext.mode`. To kodegrener:
  - `'live'`: uendret. `trailHistoryRef` bygges som før.
  - `'replay'`: deaktiver `usePollingData`, driv entities + trails fra `useReplayEntities('flight', cursor, speed)`. `trailHistoryRef` nullstilles ved mode-switch og cursor-jump >15 min (forhindrer blanding av live og replay-trails).
- `src/components/Layers/ShipLayer/ShipLayer.tsx` — samme to-grens-mønster.
- `src/components/Layers/SatelliteLayer/` — propager TLE til `cursor` i replay. Ingen Firestore-fetch.
- `src/components/UI/StatusTicker.tsx` — modus-indikator matcher pill-farge.
- `src/index.css` — `z-11`-støtte (eller arbitrary `z-[11]` tailwind).

### Gjenbruk

- Firestore-plumbing fra fase 2 — replay-reads bruker samme `db`.
- `src/hooks/useViewport.ts` — ikke brukt i replay (server skriver globalt). Klient filtrerer client-side etter fetch.
- `src/context/LayerContext.tsx` — `count` rapporteres fortsatt i replay.
- `src/context/PopupRegistry.tsx` — replay-entiteter får popups transparent. Samme builders registrert.
- `src/components/UI/WeatherRadarControls.tsx` — **styling-inspirasjon** for play/pause/speed. Frame-array-mønsteret gjelder IKKE entity-replay.

### Tekniske beslutninger

1. **Snapshot-skriving server-side (Cloud Function), IKKE klient.** Ett Cloud Function hvert 10. min puller fra APIer og skriver autoritativ snapshot. Klient = ren leser. Kost: ~144 invokasjoner/dag × ~5 kilder = 720/dag, godt innen gratis-tier for <10 brukere.
2. **Server og klient deler kun typer, ikke fetch-kode.** `functions/src/sources/` har egne, tynne fetchere. Typer importeres fra `src/types/` via relative path i `functions/tsconfig.json`. Dupliseringen er ~300 linjer — mindre smertefullt enn workspace-refaktor nå.
3. **Aisstream i Cloud Function:** WebSocket passer dårlig med scheduled functions. Kjører **hvert 5. minutt med 30s sample-vindu** (ikke 10 min): åpne WS, samle posisjoner, lukk, skriv snapshot. Kost: ~288 invokasjoner/dag, fortsatt innenfor free tier. Gir tettere trail-interpolasjon i replay (1–3 km mellom punkter ved 20 knop, unngår "teleporterings-effekt" for svingende skip). Alternativt Cloud Run — utsatt til målt behov.
4. **Trails i replay er derivert view, ikke lagret state.**
   - Live-modus: eksisterende `trailHistoryRef`-kode uendret.
   - Replay-modus: `useReplayEntities` returnerer `{entities, trails}`. Trails = siste N=6 snapshots fra replay-cache (60 min ved 10-min kadens). Ingen ekstra fetch — bucketene er allerede lastet for interpolasjon.
   - `trailHistoryRef` nullstilles ved live↔replay-switch og cursor-jump >15 min (forhindrer falsk kontinuitet mellom live-polled og snapshot-derived posisjoner).
   - To kodegrener i FlightLayer/ShipLayer, ikke unified hook. Refaktorer senere hvis verdt.
5. **Cache-strategi forenklet.**
   - Nøkkel: `{entityType}:{10minBucket}` (ingen viewport-hash — server skriver globalt).
   - LRU in-memory only. IndexedDB andre-lag utsatt til målt behov.
   - Hent on-demand ved cursor-bevegelse. Prefetch ±1t/±4t utsatt.
6. **Replay → live-overgang.** På "Hopp til nå": (a) start fetching fresh live via service; (b) behold replay-entiteter på cursor; (c) når live-data lander, crossfade: entiteter i begge (by ID) glir til live-posisjon; kun-replay fader ut 500ms; kun-live fader inn 500ms.
7. **Event-markers konsolidert:** TimelineEventContext + Firestore. I replay kan vi scrolle lenger tilbake enn in-memory. Markers utenfor in-memory lazy-loades fra `/gate_crossings/{day_UTC}` når synlig range endres.
8. **Schema-versjonering:** `{ schemaVersion: N }` på hvert snapshot-doc. Reader dispatcher på versjon, migrerer **ved lesing**, ikke skriving. Gamle docs aldri omskrevet. Ny "History schemas"-seksjon i CLAUDE.md.
9. **Rendering-ytelse:** Worst case ~2000 fly + ~500 skip i replay. To-bucket interpolasjons-modell: `prev` + `next` aktive, lerp per-entity-by-ID. Ved bucket-grense: promote `next` → `prev`, fetch ny `next`.
10. **Skjul lag under replay:** pause fetch for det laget, behold cursor. Ved re-toggle: fetch snapshots for synlig tidsrange.
11. **z-index:** `z-11` (over StatusTicker z-10, under InfoPopup z-20).
12. **Data-gap-deteksjon klient-side.** Replay-reader sjekker bucket-sekvens: hvis `nextBucket.ts - prevBucket.ts > 1.5 × expectedCadence`, marker gap. Render grå prikk i EventMarkers + tooltip "Ingen data {fra}–{til}". Ingen server-side gap-doc trengs.
13. **Tastatur i replay:** `Space` = play/pause, `←/→` = ±1 bucket, `L` = toggle LIVE/REPLAY, `Home` = hopp til nå, `End` = hopp til eldste tilgjengelige. Oppdater `KeyboardHelpModal` med "Tidslinje"-seksjon.

### Verifikasjon

1. Kjør Cloud Function backfill for 24t testdata.
2. Klikk Replay → oransje pill, live polling pauser (Network: API-kall stopper).
3. Drag cursor -30 min → fly hopper til 30-min-gamle posisjoner. 2t/s play: myk bevegelse via lerp.
4. Trails i replay: rullerer med cursor, viser siste 60 min konsistent.
5. Live→replay switch: `trailHistoryRef` nullstilles, ingen falsk kontinuitet.
6. Pan viewport under replay → ingen ny Firestore-read (server-writes er globale, bucket allerede i LRU).
7. Klikk crossing-prikk → tooltip + entity highlight på cursor-moment.
8. Klikk "Hopp til nå" → myk overgang, ingen flicker, live gjenopptas.
9. Endre schemaVersion manuelt i test-doc → reader logger warning + kjører migrator.
10. Toggle Flight av under replay → fly forsvinner, fetches for flight-historikk pauser.
11. Firestore billing etter 1t aktiv scrubbing: reads < 1000.
12. Disconnect under replay → toast "Historikk ikke tilgjengelig", cursor fryser grasiøst.

---

## Åpne beslutninger (må avklares før implementering)

Besluttede (fjernet fra listen): gates + crossings globale, klient skriver crossings, Google sign-in, pause-fetch ved skjult lag i replay.

1. **Firebase-prosjekt:** Opprettet? Hvem eier? Billing-alert konfigurert? Må gjøres før fase 2 starter.
2. **Aisstream i Cloud Function:** 5-min-kadens × 30s-vindu er besluttet — men bekreftes mot faktisk kost og replay-kvalitet i fase 3-leveransen.

---

## Adresserte tradeoffs (oppsummering)

- **Firestore read-kost ved scrubbing:** Server skriver globalt → én bucket per tid dekker alle brukere, delt LRU-cache per klient. Aggregerings-funksjon er fallback hvis målt nødvendig.
- **Fase 1 in-memory vs fase 2 server events:** Firestore = truth fra fase 2. In-memory = write-through cache. Fase 1-queue blir "recent events window"; eldre events lazy-loades.
- **Charts i tidslinjen eller flytende?** Flytende. Baren er 44px, ikke plass.
- **Historisk entity-rendering ytelse:** To-bucket interpolasjons-modell + Cesium CallbackProperty + reuse scratch Cartesian3 = 60fps for ~2000 entiteter.
- **Schema-versjonering (revidert):** `{ schemaVersion }` på hvert doc. Migratorer kjører ved lesing. **Writes avvises via security rule** hvis feltet mangler eller er eldre enn `CURRENT_SCHEMA` — hindrer utdaterte klienter i å forurense nyere data.
- **Gates-skop:** globale i Firestore med `ownerUid`. Kun eier kan skrive/slette, alle autentiserte leser. Løser navne-paradokset i delt tidslinje.
- **Auth:** Google sign-in (ikke anonym). Identitet persisterer på tvers av enheter. Porter og paneler overlever laptop-bytte.
- **Kost-kontroll:** budget-alert 1 USD/dag + per-UID rate-limit i rules + remote kill-switch-doc (`/config/killSwitch`).
- **Skala vs kompleksitet:** <10 brukere rettferdiggjør enkle valg (duplisert server-fetcher, ingen IDB-cache, ingen prefetch, typer-only sharing, ingen Firebase Emulator — testes direkte mot prod-Firestore med billing-alert som backstop). Re-evalueres ved vekst.

## Utrulling

- **Fase 1:** 1,5 uker. Ren klient (inkl. vitest + GateNameModal + onboarding + empty states). Feature alene etter levering.
- **Fase 2:** 1,5 uker. Første Firebase-integrasjon + Google sign-in + gates-migrering til Firestore. Snapshot-kadens bevist her. Firebase-prosjekt må opprettes før start.
- **Fase 3:** 2 uker. Cloud Function + replay-modus + cache-lag. Bygger på fase 2.

Stopp etter fase 1 = ferdig geofencing. Stopp etter fase 2 = ferdig analytikk. Fase 3 krever fase 2.

## CLAUDE.md-oppdateringer per fase

- **Fase 1:** Ny "Gates"-seksjon (GateContext, TimelineEventContext, crossing-deteksjon-mønster, tastatur-shortcuts).
- **Fase 2:** Ny "Firebase"-seksjon (region eur3/europe-west1, Google sign-in, schemaVersion både lese + skrive, gates/crossings globalt skop, UTC-konvensjon, env-vars, kill-switch). Oppdater gotchas: lag-skop for historikk.
- **Fase 3:** "History schemas"-seksjon (migrator-registry, replay vs live-to-kodegrens-mønster, data-gap-deteksjon).
