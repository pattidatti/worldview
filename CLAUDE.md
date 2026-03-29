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

Copy `.env.example` to `.env.local`. Required:
- `VITE_CESIUM_ION_TOKEN` — Cesium Ion access token (globe won't render without it)
- `VITE_AISSTREAM_API_KEY` — AISStream WebSocket key (ship layer)
- `VITE_API_BASE_URL` — Base URL for Firebase Functions proxy (unused in current layers)

All env vars use Vite's `import.meta.env.VITE_*` convention.

## Architecture

### Path alias

`@/` maps to `src/` (configured in both `vite.config.ts` and `tsconfig.app.json`).

### Core pattern: Layers as side-effect components

Each data layer (`src/components/Layers/*/`) is a React component that **returns `null`** and operates entirely through side effects:

1. Fetches data via a **service** (`src/services/`) using `usePollingData` hook
2. Reports loading/count state to **LayerContext** (`src/context/LayerContext.tsx`)
3. Creates a Cesium `CustomDataSource`, syncs entities by ID (add/update/remove)
4. Handles entity clicks via `onSelect(PopupContent)` callback prop

To add a new layer: create a type in `src/types/`, a service in `src/services/`, a layer component following the existing pattern, register the layer ID in `src/types/layers.ts`, add default config in `LayerContext`, and mount in `App.tsx`.

### Entity update pattern (performance-critical)

All layers use the same pattern for updating Cesium entities without recreating them:
- Build a `Map<id, Entity>` from existing entities
- Iterate new data: update position via `ConstantPositionProperty.setValue()` for existing, `ds.entities.add()` for new
- Remove entities not seen in current data batch

### Two React contexts

- **ViewerContext** (`src/context/ViewerContext.tsx`) — provides the Cesium `Viewer` instance after initialization
- **LayerContext** (`src/context/LayerContext.tsx`) — manages layer visibility, loading, and count state; provides `toggleLayer()`, `isVisible()`, `setLayerLoading()`, `setLayerCount()`

### Key hooks

- **`usePollingData<T>(fetchFn, intervalMs, enabled)`** — generic polling with auto-cleanup; only polls when `enabled` is true (tied to layer visibility)
- **`useViewport(viewer, debounceMs)`** — tracks camera bounding box (`{west, south, east, north}` in degrees); used by OpenSky/AIS to request only visible-area data

### Services

Services are pure async functions (except `AISStreamConnection` which is a stateful WebSocket class with auto-reconnect). Most accept an optional `Viewport` parameter for geographic filtering. Notable:
- `celestrak.ts` — fetches TLE data, parsed with `satellite.js` for orbit calculation
- `opensky.ts` — viewport-aware REST polling (15s)
- `aisstream.ts` — WebSocket connection class, batches updates every 5s
- `metno.ts` — fixed set of 18 Norwegian cities (no viewport filtering)
- `geocoding.ts` — OSM Nominatim search for SearchBar fly-to

### UI layering (z-index)

TopBar (z-10) > InfoPopup (z-20) > search dropdown (z-50). All UI uses `backdrop-blur-md` frosted glass over the globe.

### Styling

Tailwind v4 with custom CSS variables defined in `src/index.css` under `:root`. Layer colors use CSS variables (`--color-flights`, `--color-ships`, etc.) referenced in both Tailwind classes and JS code. Fonts: Inter (sans) and JetBrains Mono (mono).
