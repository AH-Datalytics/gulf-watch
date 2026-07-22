# Gulf Watch — NOLA Tropical Weather Dashboard: V1 Design

**Date:** 2026-07-22
**Status:** Approved pending user spec review
**Working name:** "The Gulf Watch — a New Orleans tropical weather desk" (site); repo/dir `gulf-watch`. Name is changeable before launch.

## Purpose & Audience

A public, AH Datalytics–branded, New Orleans–centric tropical weather dashboard. Where NHC, Tropical Tidbits, and Windy are storm-centric, this is point-centric: what does the tropics mean for New Orleans, right now. Public audience first; potential City Council/briefing audience later. Free to operate; no login.

**Not an official warning source.** Persistent disclaimer footer: "Not an official forecast. For decisions, consult the National Hurricane Center and NWS New Orleans/Baton Rouge."

## V1 Scope

**In:**
1. **Storm map** — MapLibre map: NHC forecast cone, official track with intensity-labeled points, watch/warning coastal segments (NHC colors), spaghetti model tracks (per-model toggle + "consensus only" filter), radar raster toggle (off by default), tide gauge/buoy markers with popups. New Orleans always in frame.
2. **Intensity guidance panel** — under the map when a storm is active: each model's max-wind forecast vs. time against shaded Saffir–Simpson category bands; official NHC forecast emphasized in white; landfall marker. Same a-deck data source as the track spaghetti.
3. **Live conditions** — left rail: parish watches/warnings (live, api.weather.gov), tide-gauge sparklines with departure-from-normal (New Canal, Shell Beach, Grand Isle), source/freshness footer.
4. **Quiet-season mode** — 7-day genesis outlook areas (Tropical Weather Outlook shapefiles) with probability shading, outlook text, gauges. The site is never empty.
5. **AI guidance** — ECMWF AIFS tropical cyclone tracks (BUFR from ECMWF open data) rendered dashed and grouped separately ("AI Guidance") in legend, map, and intensity panel.

**Out (phase 2 roadmap):**
- NOLA impact panel: point wind-speed probabilities (PWS product), TS-wind arrival times, QPF rainfall panel
- Google DeepMind Weather Lab ingestion (scrape-shaped; verify terms first)
- Storm surge (P-Surge) map layers; multiple simultaneous storm tabs (v1: show all cones, detail for strongest Gulf threat)

## Design: Two Moods

Same layout, two registers; the design state is itself information ("when the map goes dark, pay attention"). Mockups: `two-moods-v2.html` (session scratchpad, copy into `docs/superpowers/mockups/` during build).

- **Quiet mode — the heirloom chart.** Homage to the household paper hurricane-tracking charts of New Orleans. Cream nautical-chart cartography (#f4efe3 paper, #eae1ca land, #6b5d45 coast ink), fine 2° graticule, Georgia serif masthead, hatched genesis areas, compass rose, AHD navy (#1f3a5f) accents. Restraint rule: NOAA-chart craft, not kitsch — no faux paper texture, no fleur-de-lis.
- **Active mode — the operations desk.** AHD navy family (#0d1830 water, #1a2a49 land, #0b1424 rail), condensed caps masthead with red "Hurricane Warning in Effect" chip, amber cone (#e9c46a), white official track, muted per-model spaghetti colors, monospace timestamps and advisory countdown, alert rows with NHC-colored left borders (hurricane red #d94141, surge purple #b04fd6, TS blue #4a7fd4), gauge lines in alarm orange (#ff9a5c).

**Mode switch rule:** active mode when any NHC Atlantic storm's current position or official forecast track enters the Gulf box (98°W–80°W, 18°N–31°N); otherwise quiet mode. The ingest writes the flag into `manifest.json`; UI follows the manifest.

Layout: full-viewport map; fixed left rail 330px (bottom sheet on mobile); intensity panel strip under map in active mode.

## Architecture

Approach chosen: **GitHub Actions ingest → Vercel Blob → static-ish Next.js frontend** (matches NICS/overtime dashboard patterns).

```
gulf-watch/
├── ingest/                  # Python 3.12
│   ├── ingest.py            # orchestrator: poll → convert → upload
│   ├── nhc.py               # CurrentStorms.json, cone/track/ww shapefiles → GeoJSON
│   ├── adeck.py             # ATCF a-deck parse: tracks + intensity, model whitelist
│   ├── aifs.py              # ECMWF open-data TC track BUFR → GeoJSON
│   ├── outlook.py           # TWO genesis shapefiles + text
│   ├── blob.py              # Vercel Blob REST upload
│   └── tests/               # unit tests against fixture files
├── web/                     # Next.js (App Router) on Vercel
└── .github/workflows/ingest.yml
```

### Ingest cycle
Cron: every 30 min Jun 1–Nov 30, every 2 h otherwise. Each run:
1. Fetch `CurrentStorms.json`. Process **all** active Atlantic storms (cones appear on the map regardless of mode); the manifest mode flag alone follows the Gulf-box rule above. No Atlantic storms at all → refresh outlook products, write quiet manifest, exit.
2. Per storm, compare advisory number and model cycle against `state.json` in Blob; only fetch/convert what changed.
3. New advisory → cone, track line/points, wind radii, watch/warning shapefiles → GeoJSON.
4. New model cycle → a-deck parse (whitelist: AVNO/GFS, EMXI/ECMWF, HFSA, HFSB, EGRR/UKMET, TVCA/consensus for tracks; DSHP, LGEM added for intensity panel) → `models.geojson` + `intensity.json`; AIFS BUFR track appended when available.
5. Upload to stable Blob paths: `storms/{id}/cone.geojson`, `track.geojson`, `wwlines.geojson`, `models.geojson`, `intensity.json`; `outlook.geojson`, `outlook.json`; `manifest.json` last (mode flag, advisory number/time, next-advisory time, model cycle, per-file timestamps).

### Frontend data flow
- Storm/outlook layers from Blob (SWR revalidate ~5 min against manifest).
- Client-side live fetches, no backend: api.weather.gov alerts for the five metro parishes (Orleans, Jefferson, St. Bernard, Plaquemines, St. Tammany); CO-OPS tide gauges 8761927 New Canal, 8761305 Shell Beach, 8761724 Grand Isle (48 h, 6-min data); radar via Iowa Environmental Mesonet NEXRAD WMS tiles.
- Charts: Recharts (gauge sparklines, intensity panel). Map: MapLibre.

## Error Handling

- Ingest failure leaves last-good Blob files untouched; site degrades to "data as of X."
- Staleness banner when manifest data > 8 h old during active mode (> 26 h in quiet mode).
- Each ingest step is independent — an a-deck failure doesn't block the cone update; failures logged in the manifest per product.
- Client fetch failures render the panel with a per-panel "unavailable" state, never break the page.
- A-deck parse is defensive: unknown model codes ignored; malformed lines skipped and counted.

## Testing & Development

- Ingest unit tests run against committed fixture files (an archived storm's real advisory GIS zips + a-deck) — no network in tests.
- **Demo mode** (`?demo=1`): frontend loads a committed fixture storm so active-mode UI is developable/reviewable in the off-season and never depends on a live hurricane. Demo mode shows a "SIMULATED STORM" tag (as in the mockup).
- Verification before "done": both modes rendered in a real browser; ingest run against fixtures; one live end-to-end run of the Action.

## Deployment

- New Vercel project (name `gulf-watch`), AH Datalytics scope; domain decision (e.g. `gulfwatch.ahdatalytics.com`) deferred until launch.
- Git-connected deploys (per standing rule: push, don't CLI-deploy).
- Secrets: `BLOB_READ_WRITE_TOKEN` in GitHub Actions secrets.

## Build Notes

- User is conserving Fable capacity: implementation tasks delegated to Sonnet subagents; Fable reserved for architecture, review, and debugging.
- Follow AHD standards: no portal header bars, favicon = AHD navy triangle, y-axes start at 0 with round intervals.
