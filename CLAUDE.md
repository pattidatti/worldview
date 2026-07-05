# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WorldView is an interactive 3D globe showing real-time data (flights, ships, satellites, weather, webcams, road traffic, asteroids, armed conflicts, natural disasters, news events) from open APIs. Built with React 19 + TypeScript + Vite + Tailwind CSS 4 + CesiumJS. All UI text is in Norwegian (bokmal).

See `DESIGN.md` for full vision, API sources, color palette, and implementation roadmap.

## Commands

```bash
npm run dev         # Vite dev server with HMR
npm run build       # TypeScript type-check (tsc -b) + Vite production build
npm run lint        # ESLint
npm run preview     # Preview production build locally
npm test            # Vitest — kjører alle .test.ts i src/
npm run test:watch  # Vitest watch mode
```

Tester ligger i `src/**/__tests__/*.test.ts` (foreløpig kun `utils/geofence`, `utils/crossingDetector`, `utils/trailBuffer`).

## Environment Variables

Copy `.env.example` to `.env`. Required:
- `VITE_CESIUM_ION_TOKEN` — Cesium Ion access token (globe won't render without it)
- `VITE_AISSTREAM_API_KEY` — AISStream WebSocket key (ship layer)
- `VITE_WINDY_WEBCAMS_API_KEY` — Windy Webcams API key (webcam layer)
- `VITE_TOMTOM_API_KEY` — TomTom Traffic API key (traffic incident layer)
- `VITE_API_BASE_URL` — Base URL for Firebase Functions proxy (unused in current layers)

Optional (layers degrade gracefully without them):
- `VITE_NASA_API_KEY` — NASA NeoWs asteroid API; falls back to DEMO_KEY (public, rate-limited)
- `VITE_ACLED_API_KEY` — ACLED conflict data (requires account at acleddata.com)
- `VITE_ACLED_EMAIL` — Email tied to ACLED account registration (required alongside API key)

**Firebase (fase 2+):**
- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` — påkrevd for innlogging, gate-sync og snapshot-historikk. Uten disse vises `SignInGate` med feilmelding og appen er lokked.

All env vars use Vite's `import.meta.env.VITE_*` convention.

## Critical Gotchas

- **IKKE bruk resium** — har CJS `require("react")` bug med Vite. Vi bruker CesiumJS direkte.
- **satellite.js: bruk v5** — v7 har WASM/top-level-await som krasjer Vite build.
- **TomTom Traffic API** — krever gratis API-nøkkel (2500 req/dag). Trafikk-laget er viewport-avhengig; returnerer tomt array hvis viewport > 10 000 km².
- **StrictMode er fjernet** — dobbeltmonterer Cesium Viewer og forårsaker krasj.
- **ALDRI legg til `selectedEntityChanged` listeners i lag** — bruk PopupRegistry-mønsteret (se under). Listener-stacking var hovedårsak til krasj.
- **airplaneslive.ts erstatter opensky.ts** for flightlaget — viewport-aware via center-point + radius i nautiske mil (maks 250nm).
- **WeatherRadarLayer og GPSJamLayer er unntakene** — de eneste lagene som bruker `ImageryLayer`/`UrlTemplateImageryProvider` i stedet for `CustomDataSource`. WeatherRadarLayer returnerer også JSX. Fjern gammelt lag fra viewer før nytt legges til (unngå stacking).
- **ACLED krever nøkkel + e-post** — begge `VITE_ACLED_API_KEY` og `VITE_ACLED_EMAIL` må være satt. Mangler én av dem returneres tomt array stille.
- **Firebase valgfritt med gjeste-modus** — `SignInGate` tilbyr "FORTSETT SOM GJEST" ved siden av Google-innlogging. I gjeste-modus funker live-lag, men porter og historikk lagres kun i localStorage (ingen Firestore-writes). `guestMode`-flagget persisteres i localStorage-nøkkel `worldview-guest-mode`. Mangler `VITE_FIREBASE_*` er kun gjeste-modus tilgjengelig.
- **Lag-skop for historikk** — kun `flights`, `ships`, `conflicts`, `disasters`, `news` (og senere alle count-bærende lag) får snapshots. Satellitter propageres deterministisk fra TLE. Værradar, asteroider, trafikk og resten får ingen historikk-writes.
- **UTC i storage, lokal i UI** — Firestore-doc-IDer bruker `YYYY-MM-DD_UTC`. `expiresAt`-felt er 30d etter ts.
- **schemaVersion på alle writes** — firestore.rules avviser writes uten `schemaVersion == CURRENT`. Migratorer kjører ved lesing (se `src/utils/schemaMigrators.ts`).
- **Bruk `syncEntities<T>()`** for all entity-reconciliation (`src/utils/syncEntities.ts`) — erstatter manuell Map-bygging + loop + slett-gammel. `onAfterCreate` callback brukes til fade/bounce-animasjoner.
- **Bruk `entityFade.ts`** for entity-animasjoner (`src/utils/entityFade.ts`) — `fadeInEntity`, `fadeOutEntity`, `bounceInEntity` drives av ÉN delt 30fps-animasjonsdriver (én timer + én `requestRender` per tick uansett antall entiteter). Ikke implement egne animasjonsløkker.
- **AIS WebSocket proxy i dev** — `aisstream.ts` kobler til `/ais-ws` lokalt; Vite-konfigens `aisProxy()`-plugin tunneler dette til `wss://stream.aisstream.io/v0/stream`. I prod: direkte WSS-tilkobling.

## History schemas (fase 3)

Fase 3 introduserer tidslinje-scrubber + playback. Entity-snapshots skrives av Cloud Functions i `europe-west1` til Firestore.

- **Collections**:
    - `/entities/flight/buckets/{YYYY-MM-DD_UTC}_{bucketIdx}` — hvert 10. min, hele Nord-Europa.
    - `/entities/ship/buckets/{YYYY-MM-DD_UTC}_{bucketIdx}` — hvert 5. min med 30s AIS-vindu.
    - `/entities/disaster/buckets/...` og `/entities/news/buckets/...` — hvert 10. min.
- **Doc-format**: `{ ts, schemaVersion, expiresAt, items: T[], count }`. `items` er array av entity-typer (`ReplayFlight`, `ReplayShip`, etc. i `src/types/replay.ts`).
- **TTL**: `expiresAt = ts + 30d`. TTL-policy settes manuelt per kolleksjon i Firebase Console (CLI støtter ikke TTL).
- **Security rules**: klient har READ-tilgang for auth, men `write: false` — kun Cloud Function via admin SDK kan skrive. Gate-crossings (`/gate_crossings/{day}/events/{id}`) er write-fra-klient med idempotent doc-ID.
- **Cloud Function-kode**: `functions/src/{index,snapshotWorker,sources/*}.ts`. Sharing: typer duplikat-kopieres (ikke shared workspace) — `CURRENT_ENTITY_SCHEMA` holdes manuelt i sync mellom `functions/src/schemaVersion.ts` og `src/utils/schemaMigrators.ts`.
- **Replay-lesing klient**: `src/services/historyReplay.ts` henter bucket on-demand. LRU-cache (`src/utils/historyCache.ts`, cap 48) ved nøkkel `${type}:${bucketTs}`. Interpolasjon mellom prev+next bucket i `src/utils/entityInterpolation.ts`.
- **Hook**: `useReplayEntities(type, cursorTs)` returnerer `{ entities, trails, loading }`. Trails = siste 6 buckets før cursor (60 min for fly, 30 min for skip).
- **Live vs replay i lag**: FlightLayer og ShipLayer har to kodegrener. I replay-modus: polling/WebSocket pauses, dead-reckoning pauses, `flights`/`ships`-state drives fra replay-hook. SatelliteLayer propagerer TLE til cursor via `computePositions(tle, new Date(cursor))`.
- **Mode-switch og cursor-jump >15 min**: nullstill `trailHistoryRef`, `drStateRef`, `lastEntityStateRef`, og fjern eksisterende entities fra dataSource. Forhindrer blanding av live og replay-derived posisjoner.
- **Data-gap-deteksjon**: klient-side i `useReplayEntities`. Hvis prev+next buckets er tomme innen forventet Cloud Function-kadens, emitteres `{ kind: 'data-gap' }` til TimelineEventContext og rendres som grå stripe i EventMarkers.
- **Speed-knapper**: 0 (PAUSE), 30 (30m/s), 120 (2t/s), 360 (6t/s) — sekund-multiplier av sanntid.
- **TimelineModeContext**: wrappet i App mellom `HistoryProvider` og `GateProvider`. Eksponerer `mode`, `cursor`, `speed`, `setMode`, `setCursor`, `setSpeed`, `jumpToNow`, `modeEpoch` (øker ved mode-switch, brukt av lag for reset).
- **Cloud Function-sampling**: `functions/src/sources/flights.ts` bruker 5 sample-punkter à 250nm (airplanes.live max-radius) som dekker Nord-Europa. `ships.ts` bruker én bounding box [45..75°N, -15..40°E]. Utvides ved behov.

## Firebase

- **Region**: Firestore `eur3`. Cloud Functions fase 3 er deployet i `europe-west1`.
- **Auth**: Google sign-in via `signInWithPopup` med redirect-fallback. Identitet persisterer på tvers av enheter.
- **Bootstrap**: `firebase login` + `firebase use --add <prosjekt-id>`. Konfigurer Google-provider i Firebase Console → Authentication. Opprett TTL-policy på `expiresAt`-feltet for kolleksjonene `snapshots/*/entries` og `gate_crossings/*/events` (CLI støtter ikke TTL — gjøres i Console).
- **Billing-alert** 1 USD/dag settes i Firebase Console → Usage.
- **Kill-switch**: Firestore-doc `/config/killSwitch` med `{ disabled: true }` leses av klient ved innlogging. Når aktiv: alle writes blokkeres, toast "Read-only modus". Slettes kun fra Firebase Console.
- **Schemas**:
    - `/gates/{gateId}` = `{ name, vertices, color, ownerUid, createdAt, schemaVersion }` — globalt delt read, kun eier kan write/delete. Visibility per-bruker i localStorage (`worldview-gates-visibility-{uid}`).
    - `/snapshots/{YYYY-MM-DD_UTC}/entries/{epochMinute}` = `{ ts, schemaVersion, expiresAt, counts }` — globalt delt, 30d TTL.
- **Deploy**: `firebase deploy --only firestore:rules,firestore:indexes`. Cloud Functions ikke brukt i fase 2.

## Architecture

### Path alias

`@/` maps to `src/` (configured in both `vite.config.ts` and `tsconfig.app.json`).

### Core pattern: Layers as side-effect components

Each data layer (`src/components/Layers/*/`) is a React component that **returns `null`** and operates entirely through side effects:

1. Fetches data via a **service** (`src/services/`) using `usePollingData` hook
2. Leser sin egen synlighet via `useLayerVisibility('<id>')` og setter status via `useLayerActions()` (begge fra `@/store/layerStore`)
3. Creates a Cesium `CustomDataSource`, syncs entities by ID (add/update/remove)
4. Registers a popup builder via **PopupRegistry** (NOT via `selectedEntityChanged` listener)
5. Calls `viewer.scene.requestRender()` after entity updates (requestRenderMode is on)

To add a new layer: create a type in `src/types/`, a service in `src/services/`, a layer component following the existing pattern, register the layer ID in `src/types/layers.ts`, add default config i `LAYER_DEFAULTS`, og mount i `App.tsx`.

**Exception:** WeatherRadarLayer returns JSX and uses `ImageryLayer` — see gotchas above.

### Entity update pattern (performance-critical)

Bruk `syncEntities<T>()` fra `src/utils/syncEntities.ts` for standard entity-reconciliation:

```ts
syncEntities({ ds, items, getId, onUpdate, onCreate, onAfterCreate, viewer })
```

- `onUpdate` — muterér eksisterende entity in-place (position, label, color, etc.)
- `onCreate` — lager ny entity, legger den til `ds.entities`
- `onAfterCreate` — valgfri, kjøres etter entity er lagt til (typisk `fadeInEntity` eller `bounceInEntity`)
- Én `requestRender()` på slutten for batch-effektivitet

Manuelt mønster (brukes kun i komplekse lag som FlightLayer der dead-reckoning krever tettere kontroll):
- Build a `Map<id, Entity>` from existing entities
- Iterate new data: update position via `ConstantPositionProperty.setValue()` for existing, `ds.entities.add()` for new
- Remove entities not seen in current data batch

### Ytelses-mønstre

- **Dead-reckoning-kadens**: `FlightLayer` ekstrapolerer posisjoner via `setInterval(250ms)` (4 Hz), IKKE via 60fps `requestAnimationFrame`. Ringer `viewer.scene.requestRender()` kun når minst én posisjon faktisk endret seg. Rask nok for subpixel-nøyaktighet ved typisk zoom, ~96 % færre frames enn gammel RAF-løkke.
- **Trail-lagring**: Bruk `TrailBuffer<Cartesian3>` med fast kapasitet (`MAX_FLIGHT_TRAIL = 40`, `MAX_SHIP_TRAIL = 60`). Unngår array-kloning ved push/shift på hver poll.
- **Tracking-lookup**: `GlobeViewer` cacher `(trackedId, dsIndex)` mellom frames. Lineært søk gjennom alle dataSources gjøres kun på cache-miss.
- **Polling-jitter**: `usePollingData` har default 1.5s startup-jitter som sprer nettverkskallene til ~11 polling-lag så de ikke alle fyrer i samme tick ved oppstart.
- **Zustand over context for høy-frekvens-state**: Lag-status oppdateres hver 5–30s per synlige lag. Context-arkitektur ville forårsaket cascade-renders av 28 lag-komponenter. Zustand med granulære selektorer subscriber per lag-id slik at kun de komponentene som faktisk leser endrede felt re-renders.
- **Multi-datasource-mønster**: Komplekse lag bruker 2–5 separate `CustomDataSource`-instanser for z-ordering og synlighetskontroll. ShipLayer: 5 (hull, superstructure, trails, labels, wakes). FlightLayer: 3 (entities, trails, pulses). InfrastructureLayer: 5 (facilities, pipelines, fields, osm-installations, osm-pipelines). Separate datasources gir riktig z-rekkefølge uten at entity-properties kolliderer.
- **Overpass serial queue**: `overpass.ts` serialiserer alle Overpass-kall med 400ms gap for å unngå 429-feil. Backoff til 30s ved 429, reset til 400ms ved suksess. Samtidige identiske spørringer dedupes til én in-flight promise.

### Clustering pattern

ConflictLayer and NewsLayer use clustering via `configureCluster(ds, { pixelRange, minimumClusterSize, color })`:
- Cluster icons are dynamically generated SVG circles with a count label
- Size by count: <10 = 32px, <50 = 40px, ≥50 = 48px
- Cache keyed by `count-color` to avoid redundant SVG generation

### State management

**Layer-state: Zustand-store (`src/store/layerStore.ts`)** — IKKE context.
- Normalisert state: `visibility: Record<LayerId, boolean>` + `status: Record<LayerId, { loading, count, error, lastUpdated }>` + `meta: Record<LayerId, { name, color }>` (statisk fra `LAYER_DEFAULTS`).
- Granulære selektorer: `useLayerVisibility(id)`, `useLayerStatus(id)`, `useLayerActions()`, `useActiveLayerIds()`, `useVisibleLayerIds()`, `useLayerConfig(id)`. Hver selektor subscriber kun til det den leser → ingen cascading re-renders.
- Actions (fra `useLayerActions()`): `toggleLayer`, `toggleCategory`, `setLayerLoading`, `setLayerCount`, `setLayerError`, `setLayerLastUpdated`. Stabile referanser, trygge i useEffect-deps.
- `LayerContext.tsx` beholder en `useLayers()`-shim for bakoverkompatibilitet — brukes KUN av `TopBar`, `EventLog`, `LayerErrorWatcher` som legitimt trenger hele lag-arrayet. Alle andre komponenter (alle 28 lag, `StatusTicker`, `LayerPanel`, `SearchBar`, `AnalysisMenu`, `DeltaPanel`, `GatePanel`, `WeatherRadarControls`, `App.tsx`) bruker granulære selektorer direkte.
- Synlighet persisteres til localStorage-nøkkel `worldview-layer-visibility`.
- For engangslesing utenfor komponenter (f.eks. i intervallet i `HistoryContext`): bruk `useLayerStore.getState().status` — ingen subscription, ingen re-render-trigger.

### React contexts

- **ViewerContext** (`src/context/ViewerContext.tsx`) — provides the Cesium `Viewer` instance after initialization
- **AppProviders** (`src/app/AppProviders.tsx`) — wrapper som grupperer alle contexts i fire logiske bolker (Auth, ViewProviders, TimelineStateProviders, InteractionProviders, UiProviders). Brukes i `App.tsx` i stedet for 13-nivåers inline nesting.
- **AuthContext** (`src/context/AuthContext.tsx`) — Firebase-auth + `guestMode`. Eksponerer `enterGuestMode`/`exitGuestMode`.
- **PopupRegistry** (`src/context/PopupRegistry.tsx`) — centralized entity click handling. Each layer calls `register(dataSourceName, builderFn)` with a function that takes an Entity and returns PopupContent or null. GlobeViewer has ONE `selectedEntityChanged` listener that calls `resolve(entity)`. Builders use refs for data to avoid re-render dependencies.
- **TooltipRegistry** — centralized hover handling, same pattern as PopupRegistry
- **OrbitContext** (`src/context/OrbitContext.tsx`) — boolean flag `orbitActive` + `setOrbitActive`; camera orbit implementation lives in GlobeViewer (not yet implemented)
- **GateContext** (`src/context/GateContext.tsx`) — user-drawn polyline "gates" used for geofencing. CRUD + localStorage-persistens (key `worldview-gates`, schema v1). Eksponerer også draw-modus (`isDrawing`, `isDrawingRef`, `startDrawing/pushDrawVertex/popDrawVertex/finishDrawing/cancelDrawing`). `isDrawingRef` leses av GlobeViewer og `useHoverTooltip` for å suspendere entity-valg og tooltips under tegning. Faller pent tilbake til localStorage når `uid == null` (guest-modus).
- **TimelineEventContext** (`src/context/TimelineEventContext.tsx`) — bounded queue (cap 1000, LIFO) for strukturerte hendelser (`gate-crossing`, `layer-alert`, `data-gap`). `append(events)` er idempotent på `id`-feltet. Dette er IKKE EventLog — som kun er count-delta-snapshot per lag.
- **TrackingContext** (`src/context/TrackingContext.tsx`) — global kamera-følging av entitet. Eksponerer `trackedEntityId` og `setTrackedEntityId`. Styres av InfoPopup's "Følg"-knapp; GlobeViewer leser den for å holde kamera låst til valgt entitet.

### Porter (gates) + crossing-deteksjon

- `GateLayer` rendrer porter som polyliner via `PolylineGlowMaterialProperty`, eier også draw-mode-input via `useGateDrawing` (ScreenSpaceEventHandler for LEFT_CLICK, MOUSE_MOVE for preview, LEFT_DOUBLE_CLICK/Enter for fullfør, Escape/Backspace via window keydown).
- Matematikk: `src/utils/geofence.ts` gjør segment-intersection i lokal ENU-tangent-plan per gate-segment (korrekt opp til ~100 km segmentlengde). Porter nær polene (|lat|>80°) eller over antimeridianen avvises.
- Crossing-deteksjon skjer i `FlightLayer` og `ShipLayer` i deres `updateEntities()`-løkke — det finnes IKKE en sentral crossing-service. Hvert lag holder `lastEntityStateRef: Map<id, {pos, ts}>` separat fra `trailHistoryRef` (trail-strukturen utvides IKKE, for å unngå blast radius). Stale-trail-vern: ignorerer crossings hvis `dt > 2 × pollKadens` (20s for fly, 10s for skip).
- Events flushes via `appendEventsRef.current(events)` én gang per poll-iterasjon. Idempotent doc-ID (`gateId:entityId:segmentIndex:tsMinute`) — trygt å kalle flere ganger.

### Key hooks

- **`usePollingData<T>(fetchFn, intervalMs, enabled, options?)`** — generic polling with auto-cleanup; only polls when `enabled` is true (tied to layer visibility). `options.startupJitterMs` (default 1500ms) sprer første fetch for å unngå at alle synlige lag treffer nettverket samtidig ved oppstart.
- **`useViewport(viewer, debounceMs)`** — tracks camera bounding box (`{west, south, east, north}` in degrees); used by AIS/flights to request only visible-area data
- **`useEntityScreenPos(viewer, entity)`** (`src/hooks/useEntityScreenPos.ts`) — konverterer en Cesium-entitets 3D-posisjon til 2D skjermkoordinater (`{x, y} | null`) via `preRender`-event. Oppdaterer kun state ved ≥0.5px endring (hysterese). Brukes av `EntitySelector` for bracket-overlay-plassering.

### Key utils

- **`TrailBuffer<T>`** (`src/utils/trailBuffer.ts`) — fixed-size circular buffer brukt av `FlightLayer` og `ShipLayer` for posisjons-trails. O(1) push, `tail(n)` / `head(n)` / `toArray()` returnerer kronologisk rekkefølge uten array-kloning per poll. Enhetstester i `__tests__/trailBuffer.test.ts`.
- **`syncEntities<T>()`** (`src/utils/syncEntities.ts`) — generisk entity-reconciliation: bygg/oppdater/slett Cesium-entiteter mot ny datamengde. Se Entity update pattern over.
- **`entityFade.ts`** (`src/utils/entityFade.ts`) — `fadeInEntity(entity, viewer, ms=600)`, `fadeOutEntity(entity, viewer, ms=400, onDone?)`, `bounceInEntity(entity, viewer, ms=450)`. Alle jobber deles av én 30fps-driver (`setInterval`) som muterer `ConstantProperty`-verdier og kaller `requestRender` maks én gang per tick.

### Services

Services are pure async functions (except `AISStreamConnection` which is a stateful WebSocket class with auto-reconnect). Most accept an optional `Viewport` parameter for geographic filtering. Notable:
- `celestrak.ts` — fetches TLE data, parsed with `satellite.js` for orbit calculation
- `airplaneslive.ts` — airplanes.live v2 API, viewport-aware (center + radius in nautical miles, capped at 250nm), 15s poll
- `aisstream.ts` — WebSocket connection class, batches updates every 5s
- `metno.ts` — fixed set of 18 Norwegian cities (no viewport filtering)
- `webcams.ts` — Windy Webcams API, paginated (4×50=200 per viewport), sessionStorage cache (9min TTL, image URLs expire after 10min), skips Null Island on global view
- `tomtom-traffic.ts` — TomTom Incident Details v5, viewport-aware bbox queries, 90s cache, 8s timeout, returns Norwegian descriptions; skips if viewport > 10 000 km²
- `geocoding.ts` — OSM Nominatim search for SearchBar fly-to
- `acled.ts` — ACLED API, last 7 days, up to 2000 conflict events, requires API key + email
- `eonet.ts` — NASA EONET v3, open natural disaster events, no key; skips earthquakes (handled separately by USGS)
- `gdelt.ts` — GDELT GeoJSON, last 60 min of geolocated news, no key, up to 2000 events
- `nasa-neo.ts` — NASA NeoWs, asteroid close approaches next 7 days, optional key (DEMO_KEY fallback)
- `rainviewer.ts` — RainViewer weather radar, fetches frame timestamps + tile URL helper, no key
- `wikipedia.ts` — OSM Nominatim + Wikipedia summary for popups; tries Norwegian first, falls back to English; two-tier cache (memory + sessionStorage, 1h TTL)
- `overpass.ts` — Overpass API wrapper for OpenStreetMap-data (brukt av InfrastructureLayer og PowerLayer). 3-nivå cache: in-memory → localStorage LRU (200KB/entry) → Firestore delt tile-cache. Serial request queue med 400ms gap, 30s backoff ved 429, dedup av samtidige identiske spørringer. Eksporterer `DAY_MS` og `fetchOverpassInfrastructure(viewport)`.

### Layers reference

| Layer | Service | Polling | API key | Display |
|-------|---------|---------|---------|---------|
| Flights | airplaneslive.ts | 15s | None | SVG plane icons + trails, clustering (3 datasources) |
| Ships | aisstream.ts | WS/5s | Required | 3D boxes + labels + trails + wakes (5 datasources) |
| Asteroids | nasa-neo.ts | 24h | Optional | Point ring above globe (altitude ∝ miss dist) |
| Conflicts | acled.ts | 30m | Required | Ground points, clustering, size ∝ fatalities |
| Disasters | eonet.ts | 30m | None | Billboard SVG emoji icons, pulse rings (2 datasources) |
| News | gdelt.ts | 10m | None | Billboard icons, clustering |
| WeatherRadar | rainviewer.ts | 5m | None | ImageryLayer tile animation (JSX controls) |
| GPSJam | gpsjam.org tiles | daglig | None | UrlTemplateImageryProvider heatmap (imagery-lag, ikke CustomDataSource) |
| Infrastructure | sodir.ts + overpass.ts | 24h (SODIR) / viewport (OSM) | None | Clustered points, polylines, polygons (5 datasources) |
| Power | overpass.ts | viewport-triggered | None | OSM kraftlinjer, stasjoner og kraftverk |
| SubmarineCables | Static GeoJSON | én gang | None | GeoJSON polylinjer med per-kabel farger |

### UI components

- **HudDock** (`src/components/UI/HudDock/HudDock.tsx`) — bottom-right dock som samler scene-/kamera-/effekt-kontroller bak tre ikon-knapper med drawers. Inneholder `MissionControl` permanent + tre drawere (Kamera: `CameraHud` + `ResetCameraButton` + `OrbitButton`; Scene: `DimensionToggle` + `ImageryPicker`; Effekter: `ShaderOverlayPicker`). Én drawer åpen om gangen, Escape eller klikk-utenfor lukker.
- **LayerPanel** (`src/components/UI/LayerPanel.tsx`) — venstre-side kategorisert lag-liste med søk, smart default-åpne kategorier (Trafikk + Maritim), aggregert status per kategori-header (`3/7 · 421 enheter`), og rød prikk om noe lag har feil.
- **TimelineBar** (`src/components/UI/Timeline/TimelineBar.tsx`) — fixed bottom bar med `ModePill` (LIVE↔REPLAY tab), timeline-track, datovalg og playback-kontroller. Oransje glow rundt baren når replay er aktiv.
- **ShaderOverlayPicker** (`src/components/UI/ShaderOverlayPicker.tsx`) — switches between 5 visual effects: `none`, `nightvision`, `crt`, `thermal`, `anime`. Clicking active mode turns it off.
- **HudOverlay** (`src/components/UI/HudOverlay.tsx`) — decorative HUD corner brackets always visible; tactical scope/crosshair overlay appears when any shader is active (color matches shader mode)
- **StatusTicker** (`src/components/UI/StatusTicker.tsx`) — fixed bottom bar showing visible layers + entity counts (`◈ FLIGHTS 427 · SHIPS 156`). Hver oppføring subscriber via `useLayerStatus(id)` individuelt — ingen cascade-renders.
- **EventLog** (`src/components/UI/EventLog.tsx`) — collapsible live event stream (top-right), shows data changes per layer as they occur (max 12 events, LIFO). Starter kollapset.
- **GateDrawHud** (`src/components/UI/GateDrawHud.tsx`) — banner på toppen under port-tegning med vertex-teller og kbd-hints (Klikk/↵/⌫/Esc).
- **InfoPopup** (`src/components/UI/InfoPopup.tsx`) — entity-detaljer plassert ved venstre side (`left-52 top-20`) for å unngå kollisjon med GatePanel/EventLog i top-right. Støtter `enrichAsync()` (valgfri async-enrichment med shimmer-indikator), lightbox for store bilder, og "Følg"-knapp som skriver til TrackingContext.
- **GeoNavigator** (`src/components/UI/GeoNavigator.tsx`) — hierarkisk geo-navigasjon (Region → Land → By → Sted) med favorites (localStorage), breadcrumb-header og avstandssortering. Fly-to deaktiverer orbit-modus under animasjon og re-aktiverer etter.
- **PortholeOverlay** (`src/components/UI/PortholeOverlay.tsx`) — dekorativ vignette-effekt via radial-gradient, mørker kantene for dybde-illusjon. `z-index: 1`, `pointer-events-none`, `inset-0`.
- **EntitySelector** (`src/components/UI/EntitySelector.tsx`) — rendrer gylne SVG corner-brackets (56×56px) i skjermkoordinater. `selectedPos` = full opacity, `hoverPos` = 0.55 opacity. Plasseres via `useEntityScreenPos`-hook i App.tsx.
- **CameraHud** (`src/components/UI/CameraHud.tsx`) — LAT/LON/ALT/HDG display, updates every 800ms; smart altitude formatting (m/km/Mm). Vises inne i HudDock's kamera-drawer.
- **OrbitButton** (`src/components/UI/OrbitButton.tsx`) — toggle for orbit camera mode; reads/writes OrbitContext

### Shaders

GLSL fragment shaders applied as post-process stages to the entire Cesium viewport:
- `src/shaders/anime.ts` — Sobel edge detection (3×3 kernel) + saturation boost + pastelization + 5-band cel quantization + black outlines
- Other modes (nightvision, crt, thermal) are inline GLSL strings in their context/picker files
- Active shader managed via ShaderOverlayContext

### UI layering (z-index)

TopBar / LayerPanel / GatePanel / EventLog / HudDock (z-10) > InfoPopup / GateDrawHud (z-20 / z-30) > TimelineBar (z-11) > modals (z-50) > SignInGate (z-60). All UI uses `backdrop-blur-md` frosted glass over the globe.

### Styling

Tailwind v4 with custom CSS variables defined in `src/index.css` under `:root`. Layer colors use CSS variables (`--color-flights`, `--color-ships`, etc.) referenced in both Tailwind classes and JS code. Fonts: Inter (sans) and JetBrains Mono (mono).
