# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WorldView is an interactive 3D globe showing real-time data (flights, ships, satellites, weather, webcams, road traffic) from open APIs. Built with React 19 + TypeScript + Vite + Tailwind CSS 4 + CesiumJS. All UI text is in Norwegian (bokmal).

See `DESIGN.md` for full vision, API sources, color palette, and implementation roadmap.

## Commands

```bash
npm run dev       # Vite dev server with HMR
npm run build     # TypeScript type-check (tsc -b) + Vite production build
npm run lint      # ESLint
npm run preview   # Preview production build locally
```

No test framework is configured.

## Environment Variables

Copy `.env.example` to `.env`. Required:
- `VITE_CESIUM_ION_TOKEN` — Cesium Ion access token (globe won't render without it)
- `VITE_AISSTREAM_API_KEY` — AISStream WebSocket key (ship layer)
- `VITE_WINDY_WEBCAMS_API_KEY` — Windy Webcams API key (webcam layer)
- `VITE_TOMTOM_API_KEY` — TomTom Traffic API key (traffic incident layer)
- `VITE_API_BASE_URL` — Base URL for Firebase Functions proxy (unused in current layers)

All env vars use Vite's `import.meta.env.VITE_*` convention.

## Critical Gotchas

- **IKKE bruk resium** — har CJS `require("react")` bug med Vite. Vi bruker CesiumJS direkte.
- **satellite.js: bruk v5** — v7 har WASM/top-level-await som krasjer Vite build.
- **TomTom Traffic API** — krever gratis API-nøkkel (2500 req/dag). Trafikk-laget er viewport-avhengig med ~30° breddegrad-grense.
- **StrictMode er fjernet** — dobbeltmonterer Cesium Viewer og forårsaker krasj.
- **ALDRI legg til `selectedEntityChanged` listeners i lag** — bruk PopupRegistry-mønsteret (se under). Listener-stacking var hovedårsak til krasj.

## Architecture

### Path alias

`@/` maps to `src/` (configured in both `vite.config.ts` and `tsconfig.app.json`).

### Core pattern: Layers as side-effect components

Each data layer (`src/components/Layers/*/`) is a React component that **returns `null`** and operates entirely through side effects:

1. Fetches data via a **service** (`src/services/`) using `usePollingData` hook
2. Reports loading/count state to **LayerContext** (`src/context/LayerContext.tsx`)
3. Creates a Cesium `CustomDataSource`, syncs entities by ID (add/update/remove)
4. Registers a popup builder via **PopupRegistry** (NOT via `selectedEntityChanged` listener)
5. Calls `viewer.scene.requestRender()` after entity updates (requestRenderMode is on)

To add a new layer: create a type in `src/types/`, a service in `src/services/`, a layer component following the existing pattern, register the layer ID in `src/types/layers.ts`, add default config in `LayerContext`, and mount in `App.tsx`.

### Entity update pattern (performance-critical)

All layers use the same pattern for updating Cesium entities without recreating them:
- Build a `Map<id, Entity>` from existing entities
- Iterate new data: update position via `ConstantPositionProperty.setValue()` for existing, `ds.entities.add()` for new
- Remove entities not seen in current data batch

### Three React contexts

- **ViewerContext** (`src/context/ViewerContext.tsx`) — provides the Cesium `Viewer` instance after initialization
- **LayerContext** (`src/context/LayerContext.tsx`) — manages layer visibility, loading, and count state; provides `toggleLayer()`, `isVisible()`, `setLayerLoading()`, `setLayerCount()`
- **PopupRegistry** (`src/context/PopupRegistry.tsx`) — centralized entity click handling. Each layer calls `register(dataSourceName, builderFn)` with a function that takes an Entity and returns PopupContent or null. GlobeViewer has ONE `selectedEntityChanged` listener that calls `resolve(entity)`. Builders use refs for data to avoid re-render dependencies.

### Key hooks

- **`usePollingData<T>(fetchFn, intervalMs, enabled)`** — generic polling with auto-cleanup; only polls when `enabled` is true (tied to layer visibility)
- **`useViewport(viewer, debounceMs)`** — tracks camera bounding box (`{west, south, east, north}` in degrees); used by OpenSky/AIS to request only visible-area data

### Services

Services are pure async functions (except `AISStreamConnection` which is a stateful WebSocket class with auto-reconnect). Most accept an optional `Viewport` parameter for geographic filtering. Notable:
- `celestrak.ts` — fetches TLE data, parsed with `satellite.js` for orbit calculation
- `opensky.ts` — viewport-aware REST polling (15s)
- `aisstream.ts` — WebSocket connection class, batches updates every 5s
- `metno.ts` — fixed set of 18 Norwegian cities (no viewport filtering)
- `webcams.ts` — Windy Webcams API, paginated (4x50=200 per viewport), returns direct JPEG URLs
- `tomtom-traffic.ts` — TomTom Incident Details v5, viewport-aware bbox queries, returns localized Norwegian descriptions
- `geocoding.ts` — OSM Nominatim search for SearchBar fly-to

### UI layering (z-index)

TopBar (z-10) > InfoPopup (z-20) > search dropdown (z-50). All UI uses `backdrop-blur-md` frosted glass over the globe.

### Styling

Tailwind v4 with custom CSS variables defined in `src/index.css` under `:root`. Layer colors use CSS variables (`--color-flights`, `--color-ships`, etc.) referenced in both Tailwind classes and JS code. Fonts: Inter (sans) and JetBrains Mono (mono).
