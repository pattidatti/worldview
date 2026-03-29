# WorldView — Designdokument

## Visjon

WorldView er en interaktiv 3D-globus som viser sanntidsdata fra verden via åpne APIer. Brukere kan utforske flytrafikk, skipstrafikk, satellitter, veitrafikk, live webkameraer og værdata — alt samlet på ett sted, oppdatert i nær-sanntid.

**Målgruppe:** Alle som er nysgjerrige på verden — en offentlig webapp uten innlogging.

**Design:** Mørkt, teknisk "mission control"-estetikk. Neon-aktige farger på mørk bakgrunn. Globusen er hovedpersonen — helskjerm med minimalt men funksjonelt UI.

---

## Teknisk stack

| Komponent | Teknologi |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS 4 |
| 3D-globus | CesiumJS via `resium` (React-wrapper) |
| Backend | Firebase Functions (API-proxying, skjule nøkler) |
| Hosting frontend | GitHub Pages (via GitHub Actions) |
| Hosting backend | Firebase |
| Versjonskontroll | Git + GitHub |

---

## Datakilder / APIer

| Lag | API | Gratis? | Krever nøkkel? | Proxy nødvendig? | Beskrivelse |
|---|---|---|---|---|---|
| Kartet | Cesium Ion | Ja (gratis tier) | Ja | Nei (frontend-nøkkel) | 3D-terreng og kartfliser |
| Flytrafikk | OpenSky Network API | Ja | Nei (anonym) / Ja (bedre rater) | Ja (CORS) | Live flyposisjoner globalt |
| Skipstrafikk | AISHub / MarineTraffic AIS | Ja (begrenset) | Ja | Ja | AIS-data for skip globalt |
| Satellitter | CelesTrak (TLE-data) | Ja | Nei | Nei (CORS OK) | Two-Line Element data for satellittbaner |
| Veitrafikk | TomTom Traffic Incidents API v5 | Ja (gratis tier, 2500 req/dag) | Ja | Nei (CORS OK) | Trafikkhendelser globalt (ulykker, veiarbeid, stengninger) |
| Webkamera NO | Vegvesenet webkamera-API | Ja | Nei | Nei | Live trafikkameraer i Norge |
| Webkamera globalt | Windy Webcams API | Ja (gratis tier) | Ja | Ja | Webkameraer over hele verden |
| Vær Norge | MET Norway (Yr) Locationforecast | Ja | Nei (krever User-Agent) | Nei | Detaljert vær for Norge/Norden |
| Vær globalt | OpenWeatherMap | Ja (gratis tier) | Ja | Ja | Global værdata |

---

## Brukeropplevelse (UX)

### Hovedvisning
- Fullskjerm 3D-globus som fyller hele vinduet
- Alle datalag synlige som standard
- Zoom inn/ut for detaljer — clustering på avstand, individuelle objekter nært

### Interaksjon
- **Klikk på objekt:** Info-popup med relevant data (flynr, rute, hastighet, etc.)
- **Søkefelt:** Finn spesifikke fly, båter, steder via geocoding + objekt-søk
- **Lag-kontroller:** Toggle av/på individuelle datalag

### Ytelseshåndtering
- **Clustering:** Gruppering av objekter når zoomet ut
- **Viewport-filtrering:** Bare last data for synlig område
- **Nær-sanntid polling:** Oppdatering hvert 30-60 sekund (ikke ekte WebSocket)

---

## Arkitektur

### Frontend (GitHub Pages)
```
src/
├── components/
│   ├── Globe/              # CesiumJS globus-wrapper med resium
│   ├── Layers/             # Ett lag per datakilde
│   │   ├── FlightLayer/    # Flytrafikk fra OpenSky
│   │   ├── ShipLayer/      # Skipstrafikk fra AIS
│   │   ├── SatelliteLayer/ # Satellitter fra CelesTrak
│   │   ├── TrafficLayer/   # Veitrafikk fra Vegvesenet
│   │   ├── WebcamLayer/    # Webkameraer
│   │   └── WeatherLayer/   # Værdata
│   ├── UI/                 # Topbar, søk, lag-panel, popup
│   └── common/             # Gjenbrukbare komponenter
├── hooks/                  # Custom hooks for data-fetching og polling
├── services/               # API-klienter for hver datakilde
├── types/                  # TypeScript-typer per lag
├── utils/                  # Hjelpefunksjoner (clustering, viewport, etc.)
├── App.tsx
└── main.tsx
```

### Backend (Firebase Functions)
```
functions/
├── src/
│   ├── proxy/              # API-proxy funksjoner
│   │   ├── opensky.ts      # OpenSky Network proxy
│   │   ├── ais.ts          # AIS-data proxy
│   │   ├── webcams.ts      # Windy Webcams proxy
│   │   └── weather.ts      # OpenWeatherMap proxy
│   └── index.ts            # Function exports
├── package.json
└── tsconfig.json
```

### CI/CD
```
.github/
└── workflows/
    └── deploy.yml          # Build + deploy til GitHub Pages
```

---

## Implementeringsrekkefølge

### Fase 1: Grunnmur
1. **Prosjektoppsett** — Git, Vite, React, TypeScript, Tailwind, Cesium
2. **GitHub + GitHub Pages** — Repo, Actions workflow for deployment
3. **Firebase setup** — Prosjekt, Functions-scaffold
4. **Grunnleggende globus** — CesiumJS med mørkt tema, fullskjerm, navigasjon

### Fase 2: Lag-system
5. **Lag-arkitektur** — Togglebar lag-system, generisk polling-pattern
6. **Clustering + viewport** — Ytelses-infrastruktur for mange punkter
7. **Info-popup** — Gjenbrukbar popup-komponent for alle lag-typer

### Fase 3: Datalag (ett om gangen)
8. **Flytrafikk** — OpenSky Network, fly-ikoner med retning, popup med flyinfo
9. **Skipstrafikk** — AIS-data, skip-ikoner, popup med skipsinfo
10. **Satellitter** — CelesTrak TLE + `satellite.js` for baneberegning
11. **Vær** — MET Norway + OpenWeatherMap, ikoner/overlegg
12. **Webkameraer** — Vegvesenet + Windy, klikkbare punkter med live bilde
13. **Veitrafikk** — Vegvesenet, hendelser og trafikkflyt

### Fase 4: Polish
14. **Søk** — Geocoding + objekt-søk
15. **Ytelsesoptimalisering** — Finjustering av clustering, caching
16. **Responsivitet** — Fungere på mobil og tablet
17. **Finjustering** — Animasjoner, overganger, loading states

---

## Designspesifikasjoner

### Fargepalett (mørkt tema)
- **Bakgrunn:** Svart/veldig mørk grå (#0a0a0f, #12121a)
- **UI-elementer:** Halvgjennomsiktig mørk (#1a1a2e med opacity)
- **Tekst:** Lys grå/hvit (#e0e0e0, #ffffff)
- **Aksenter:** Neon-blå (#00d4ff), neon-grønn (#00ff88), neon-oransje (#ff6b35)
- **Fly:** Gul/oransje
- **Skip:** Cyan/blå
- **Satellitter:** Grønn
- **Vær:** Hvit/lysblå
- **Kameraer:** Rød prikk
- **Trafikk:** Grønn-gul-rød gradient

### Typografi
- Monospace/teknisk font for data (f.eks. JetBrains Mono, Space Mono)
- Clean sans-serif for UI-tekst (Inter eller lignende)

---

## Fremtidige utvidelser (ikke i MVP)
- Brukerkontoer med innlogging
- Lagre favoritt-visninger
- Følge spesifikke fly/båter
- Historisk data / tidsreise
- Flere datakilder (jordskjelv, vulkaner, ISS-sporing, etc.)
- Deling av visninger via URL

---

## Åpne spørsmål for implementering
- Hvilken AIS-datakilde fungerer best i praksis (gratis tier)?
- Cesium Ion gratis tier — holder 50k asset-visninger/mnd?
- Optimal polling-frekvens per lag (balanse mellom ferskhet og API-rater)?
