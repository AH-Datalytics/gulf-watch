# Gulf Watch V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy Gulf Watch v1 — a NOLA-centric tropical weather dashboard with a Python/GitHub Actions ingest feeding Vercel Blob, and a two-mood Next.js + MapLibre frontend.

**Architecture:** GitHub Actions runs a Python ingest every 30 min (in season) that converts NHC/ATCF/ECMWF products to GeoJSON in Vercel Blob behind a `manifest.json`. The Next.js app reads Blob for forecast data and hits NOAA APIs client-side for live alerts/gauges. A `mode` flag in the manifest switches the entire design between "heirloom chart" (quiet) and "operations desk" (active).

**Tech Stack:** Python 3.12 (requests, pyshp — NO geopandas/GDAL), pytest; Next.js App Router + TypeScript, maplibre-gl, Recharts, plain CSS custom properties (no Tailwind); Vercel Blob REST API.

**Spec:** `docs/superpowers/specs/2026-07-22-gulf-watch-design.md`
**Authoritative visual reference:** `docs/superpowers/specs/two-moods-v2-mockup.html` — the approved mockup. All colors, spacing, typography, and SVG treatments (hatching, compass rose, category bands) come from this file. Port its CSS values; do not invent new ones.

## Global Constraints

- Workers are Sonnet subagents; Fable reviews between tasks. Ask before deviating from an interface contract.
- Site name: "The Gulf Watch — a New Orleans tropical weather desk". Brand: AH Datalytics, navy `#1f3a5f`.
- Disclaimer must render in both modes: "Not an official forecast. For decisions, consult the National Hurricane Center and NWS New Orleans/Baton Rouge."
- No emoji, no gradients, no rounded-corner card styling. Editorial/data-journalism register only.
- Y-axes start at 0 or a labeled floor with round intervals; tabular numerals for stats.
- Never fabricate data for a REAL storm: demo fixtures always use fictional "Hurricane Solene" + "SIMULATED STORM — DEMO DATA" tag.
- All ingest network calls: 30 s timeout, one retry with 10 s backoff; failures recorded per-product in `manifest.errors`, never crash the whole run.
- Commit after every green test cycle. Git identity is already configured; end commit messages with the standard Claude co-author line.
- Gulf box (mode rule + "relevant storm"): lon −98..−80, lat 18..31.
- Unit conversions: 1 kt = 1.15078 mph, round to whole mph. Category thresholds (mph): TS 39, C1 74, C2 96, C3 111, C4 130, C5 157.

## Shared Data Contracts (all tasks)

**Blob paths** (public read): `manifest.json`, `state.json`, `outlook.geojson`, `outlook.json`, `storms/{stormid}/cone.geojson`, `track.geojson`, `wwlines.geojson`, `models.geojson`, `intensity.json`. `{stormid}` is lowercase like `al092026`.

**manifest.json** (produced Task 4; consumed Tasks 7–12):
```json
{
  "generated": "2026-07-22T18:05:00Z",
  "mode": "quiet",
  "storms": [
    {
      "id": "al092026", "name": "Solene", "classification": "HU",
      "intensityMph": 105, "pressureMb": 967,
      "movementDir": "NW", "movementMph": 12,
      "lat": 26.0, "lon": -88.0,
      "advisoryNum": "14", "advisoryTime": "2026-07-22T21:00:00Z",
      "nextAdvisoryTime": "2026-07-23T03:00:00Z",
      "inGulfBox": true, "modelCycle": "2026072212",
      "files": {
        "cone": "storms/al092026/cone.geojson",
        "track": "storms/al092026/track.geojson",
        "wwlines": "storms/al092026/wwlines.geojson",
        "models": "storms/al092026/models.geojson",
        "intensity": "storms/al092026/intensity.json"
      }
    }
  ],
  "outlook": { "geojson": "outlook.geojson", "text": "outlook.json", "issued": "2026-07-22T18:00:00Z" },
  "errors": [{ "product": "aifs", "message": "BUFR decode failed" }]
}
```
`mode` = `"active"` iff any storm `inGulfBox` (current position OR any official-track forecast point inside the box).

**models.geojson**: FeatureCollection of LineStrings, properties `{ "model": "AVNO", "label": "GFS", "kind": "physics" | "ai" | "consensus" | "official", "cycle": "2026072212" }`.

**intensity.json**:
```json
{ "cycle": "2026072212",
  "series": [ { "model": "OFCL", "label": "Official", "kind": "official",
                "points": [ { "tauH": 0, "mph": 105 }, { "tauH": 12, "mph": 110 } ] } ] }
```

**Model whitelist** (module constant in `adeck.py`, imported everywhere):
```python
MODELS = {
    "OFCL": ("Official", "official"),
    "AVNO": ("GFS", "physics"), "EMXI": ("ECMWF", "physics"),
    "HFSA": ("HAFS-A", "physics"), "HFSB": ("HAFS-B", "physics"),
    "EGRR": ("UKMET", "physics"), "TVCA": ("Consensus", "consensus"),
    "DSHP": ("SHIPS", "physics"), "LGEM": ("LGEM", "physics"),
}
INTENSITY_ONLY = {"DSHP", "LGEM"}   # never draw these on the map
```

**Source URLs** (module constants in each ingest module):
- Current storms: `https://www.nhc.noaa.gov/CurrentStorms.json`
- Per-storm GIS latest zips: `https://www.nhc.noaa.gov/storm_graphics/api/{ID}_CONE_latest.zip`, `{ID}_TRACK_latest.zip`, `{ID}_WW_latest.zip` where `{ID}` is uppercase e.g. `AL092026`. Prefer explicit URLs found in CurrentStorms.json fields when present; fall back to these patterns.
- A-deck: `https://ftp.nhc.noaa.gov/atcf/aid_public/a{stormid}.dat.gz` (e.g. `aal092026.dat.gz`)
- Genesis areas: `https://www.nhc.noaa.gov/xgtwo/gtwo_shapefiles.zip`; outlook text from Atlantic RSS `https://www.nhc.noaa.gov/index-at.xml` (item titled "Atlantic Tropical Weather Outlook")
- Alerts (client): `https://api.weather.gov/alerts/active?area=LA`, filter by SAME geocodes `["022051","022071","022075","022087","022103"]` (Jefferson, Orleans, Plaquemines, St. Bernard, St. Tammany)
- Tide gauges (client): `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station={id}&product=water_level&datum=MLLW&units=english&time_zone=lst_ldt&format=json&range=48` for stations `8761927` New Canal, `8761305` Shell Beach, `8761724` Grand Isle; predictions via `product=predictions&interval=h` (same params) — departure band only where predictions return data, otherwise observed line only.
- Radar (client, active-mode toggle): IEM WMS raster `https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=nexrad-n0q&STYLES=&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true` as a MapLibre raster source tile template.

---

### Task 1: Ingest scaffold + a-deck parser

**Files:**
- Create: `ingest/requirements.txt`, `ingest/gulfwatch/__init__.py`, `ingest/gulfwatch/adeck.py`, `ingest/tests/fixtures/adeck_sample.dat`, `ingest/tests/test_adeck.py`, `ingest/pytest.ini` (`[pytest]\npythonpath = .`)

**Interfaces:**
- Produces: `parse_adeck(text: str) -> dict` returning `{"models_geojson": <FeatureCollection dict>, "intensity": <intensity.json dict>, "cycle": "YYYYMMDDHH"}` using only the **latest cycle per model** present in the file. Also `MODELS`, `INTENSITY_ONLY`, `KT_TO_MPH = 1.15078`.

**ATCF a-deck format** (comma-separated, whitespace-padded). Relevant indices after `line.split(",")` + strip: `[0]` basin, `[1]` cyclone number, `[2]` cycle `YYYYMMDDHH`, `[4]` tech (model code), `[5]` tau hours, `[6]` lat like `265N` (tenths of degree, N/S), `[7]` lon like `0897W` (tenths, E/W → W is negative), `[8]` vmax knots. The same (tech, tau) repeats once per wind-radii row — **dedupe keeping the first**. Skip rows with lat/lon of `0` or vmax missing; skip vmax `<= 0` for intensity points but keep the track point if coordinates are valid.

- [ ] **Step 1: Write requirements.txt** — `requests`, `pyshp` (pin current majors) — and the package skeleton.
- [ ] **Step 2: Write fixture** `adeck_sample.dat`: hand-craft ~30 lines covering: two cycles (only latest must be used), OFCL/AVNO/HFSA/DSHP plus a non-whitelisted `CLP5` (must be excluded), radii-duplicated taus, a `0N 0W` junk row, lon `0897W` → `-89.7` case. Example line format:
  `AL, 09, 2026072212, 03, OFCL,   0, 260N,  880W,  90,  967, HU`
- [ ] **Step 3: Write failing tests** in `test_adeck.py`: latest-cycle-only; CLP5 excluded; DSHP absent from models_geojson but present in intensity series; tau dedupe (one point per tau); lat/lon decode signs; kt→mph rounding (90 kt → 104 mph); GeoJSON properties match the `models.geojson` contract above.
- [ ] **Step 4: Run** `python -m pytest ingest/tests/test_adeck.py -v` from repo root (or `pytest` from `ingest/`) — expect FAIL (module missing).
- [ ] **Step 5: Implement `adeck.py`** (pure function, no network). Lat/lon decode: `float(val[:-1]) / 10 * (-1 if val[-1] in "WS" else 1)`.
- [ ] **Step 6: Tests green, commit** `feat: ATCF a-deck parser (tracks + intensity)`.

---

### Task 2: NHC current storms + GIS shapefile conversion

**Files:**
- Create: `ingest/gulfwatch/nhc.py`, `ingest/gulfwatch/shp.py`, `ingest/tests/test_nhc.py`, `ingest/tests/test_shp.py`, fixtures: `ingest/tests/fixtures/current_storms.json` (trimmed real structure from nhc.noaa.gov/CurrentStorms.json — fetch it once and commit), `ingest/tests/fixtures/sample_cone.zip` (any archived NHC `_CONE_latest.zip`; download one from an active or recent storm and commit).

**Interfaces:**
- Produces `nhc.py`: `parse_current_storms(data: dict) -> list[Storm]` where `Storm` is a dataclass with the fields the manifest storm entry needs (`id, name, classification, intensity_kt, pressure_mb, movement_dir, movement_mph, lat, lon, advisory_num, advisory_time, next_advisory_time, gis_urls: dict`). `in_gulf_box(lat: float, lon: float) -> bool`. `storm_in_gulf(storm: Storm, track_geojson: dict | None) -> bool` (position OR any track point in box).
- Produces `shp.py`: `zip_to_geojson(zip_bytes: bytes) -> dict` — opens shapefile zip in memory (`zipfile` + `io.BytesIO` + `shapefile.Reader(shp=..., dbf=..., shx=...)`), returns FeatureCollection with each record's fields as properties. Pure pyshp; handles polygon, polyline, point shape types.

- [ ] **Step 1: Commit fixtures** (fetch the two files with `requests` in a throwaway script; verify the JSON has at least one storm entry or use an archived copy with one).
- [ ] **Step 2: Failing tests**: storm dataclass populated from fixture (assert exact values from the fixture you committed); `in_gulf_box(29.9, -90.1) is True`, `in_gulf_box(25.0, -60.0) is False`; `storm_in_gulf` true when only a forecast point is in the box; `zip_to_geojson` returns `FeatureCollection` with ≥1 feature and expected property keys (e.g. `STORMNAME` — inspect your fixture and assert what's actually there).
- [ ] **Step 3: Implement, tests green, commit** `feat: NHC current storms parsing and shapefile-to-GeoJSON`.

---

### Task 3: Tropical Weather Outlook (quiet mode data)

**Files:**
- Create: `ingest/gulfwatch/outlook.py`, `ingest/tests/test_outlook.py`, fixtures: `ingest/tests/fixtures/gtwo_shapefiles.zip` (fetch once, commit), `ingest/tests/fixtures/index-at.xml` (fetch once, commit).

**Interfaces:**
- Produces: `build_outlook(gtwo_zip: bytes, rss_xml: str) -> tuple[dict, dict]` → (`outlook.geojson` FeatureCollection of the **7-day** genesis areas+points with properties including `PROB7DAY` / equivalent field from the shapefile, plus `RISK7DAY` normalized to `"low"|"medium"|"high"` — <40% low, 40–60% medium, >60% high; and `outlook.json` = `{"issued": <ISO8601 from RSS pubDate>, "text": <TWO plain text>}`). RSS parsing with stdlib `xml.etree`; the TWO text is the description of the item whose title contains "Tropical Weather Outlook"; strip HTML tags with a regex.
- Uses: `shp.zip_to_geojson` from Task 2 (the gtwo zip contains multiple shapefiles — iterate `.shp` members, keep ones with `7day` in the name, merge features).

- [ ] **Step 1: Commit fixtures.**
- [ ] **Step 2: Failing tests**: geojson contains only 7-day features; risk normalization thresholds; text non-empty and HTML-free; issued parses to ISO8601.
- [ ] **Step 3: Implement, green, commit** `feat: tropical weather outlook ingest`.

---

### Task 4: Blob client, state diffing, orchestrator, manifest

**Files:**
- Create: `ingest/gulfwatch/blob.py`, `ingest/gulfwatch/pipeline.py`, `ingest/ingest.py` (entry point), `ingest/tests/test_pipeline.py`

**Interfaces:**
- `blob.py`: `put_json(path: str, obj: dict) -> None`, `put_bytes(path: str, data: bytes, content_type: str) -> None`, `get_json(path: str) -> dict | None` (GET from the public base URL, 404 → None). Env vars: `BLOB_READ_WRITE_TOKEN` (writes), `BLOB_BASE_URL` (public read base, e.g. `https://<store>.public.blob.vercel-storage.com`). PUT `https://blob.vercel-storage.com/{path}` with headers `Authorization: Bearer <token>`, `x-api-version: 7`, `x-add-random-suffix: 0`, `x-allow-overwrite: 1`, `Content-Type`. **These headers must be verified against a live store in Step 4 — if the API rejects any, check the current Vercel Blob REST docs and adjust; record what worked in a code comment.**
- `pipeline.py`: `run(fetch=requests.get, store=blob) -> dict` returns the manifest it wrote. Logic: load `state.json` (`{"storms": {"al092026": {"advisory": "14", "cycle": "2026072212"}}, "outlook_issued": "..."}`); fetch CurrentStorms; for each Atlantic storm (`id` starts `al`): if advisory changed → fetch+convert 3 GIS zips; if a-deck cycle changed → fetch gz, `gzip.decompress`, `parse_adeck`; upload changed products; always rebuild manifest from current state (mode rule from Global Constraints); refresh outlook when RSS pubDate changed; write `state.json` last. Per-product try/except appends to `manifest["errors"]`.
- `ingest.py`: `python ingest.py` runs `pipeline.run()` and prints a one-line summary; exit 0 even with product errors, exit 1 only on total failure.

- [ ] **Step 1: Failing tests** with fake `fetch`/`store` doubles: quiet path (no storms → outlook refreshed, `mode == "quiet"`); active path (fixture storm w/ track in Gulf box → `mode == "active"`, all five storm files uploaded, state advanced); no-change path (same advisory+cycle → no storm uploads); error path (cone download raises → manifest has `errors` entry, other products still uploaded).
- [ ] **Step 2: Implement, green, commit** `feat: ingest pipeline, blob client, manifest`.
- [ ] **Step 3: Create the Vercel Blob store** — **CHECKPOINT: confirm with the user** which Vercel scope/team before creating; then create store `gulf-watch` and obtain `BLOB_READ_WRITE_TOKEN`.
- [ ] **Step 4: Live smoke test**: run `python ingest.py` with real env vars; verify `manifest.json` is publicly fetchable at `BLOB_BASE_URL/manifest.json` and mode matches reality (check nhc.noaa.gov). Fix header issues if any. Commit any fixes.

---

### Task 5: AIFS AI-model tracks (optional product, graceful degradation)

**Files:**
- Create: `ingest/gulfwatch/aifs.py`, `ingest/tests/test_aifs.py`; Modify: `ingest/gulfwatch/pipeline.py` (append AIFS features to each storm's `models.geojson`), `ingest/requirements.txt` (`ecmwf-opendata`, `eccodes`).

**Interfaces:**
- Produces: `fetch_aifs_tracks(storm_atcf_id: str, fetch_impl=None) -> list[dict]` — LineString features with properties `{"model": "AIFS", "label": "AIFS (ECMWF)", "kind": "ai", "cycle": ...}`. Uses ECMWF open data TC track product: model `aifs-single`, `type="tf"` (BUFR). Match tracks to the storm by name/ATCF id fields in the BUFR; if matching is unreliable, match by distance (<2° from current NHC position at tau 0).
- **Degradation rule:** any exception (including eccodes import failure) → return `[]`; pipeline logs to `manifest.errors` with product `"aifs"` and continues. This product must never block a run.

- [ ] **Step 1: Spike** (time-boxed ~30 min of effort): install deps, attempt to fetch+decode the current AIFS `tf` product for any live storm (TS Bertha exists as of plan date). If BUFR decode proves unworkable on this machine or ubuntu-latest, STOP: stub `fetch_aifs_tracks` to return `[]` with a `# TODO(phase2)` comment, note it in the task report, and skip to Step 4 — the rest of v1 must not stall on this.
- [ ] **Step 2: Failing tests**: decode a committed BUFR fixture (save one during the spike) into ≥1 LineString with correct properties; exception → `[]`.
- [ ] **Step 3: Implement + wire into pipeline** (AIFS features concatenated into `models.geojson`, cycle allowed to differ from a-deck cycle).
- [ ] **Step 4: Green, commit** `feat: AIFS AI-model tracks with graceful degradation` (or `chore: stub AIFS (phase 2)` if spiked out).

---

### Task 6: GitHub Actions workflow + repo push

**Files:**
- Create: `.github/workflows/ingest.yml`, `README.md` (short: what it is, architecture diagram in words, how to run ingest + web locally), `.gitignore` (Python + Node + `.vercel` + `.superpowers/`)

**Workflow:** two `schedule` crons — `*/30 * * * *` gated by a season check step (exit early unless month is 6–11) and `0 */2 * * *` for off-season — plus `workflow_dispatch`. Steps: checkout, setup-python 3.12, `pip install -r ingest/requirements.txt`, `python ingest/ingest.py` with `BLOB_READ_WRITE_TOKEN` and `BLOB_BASE_URL` from repo secrets. Simplest correct season gate: one 30-min cron; first step `if [ $(date +%-m) -lt 6 ] || [ $(date +%-m) -gt 11 ]; then <exit unless minute is 0 and hour is even>; fi` — or just run every 30 min year-round (runs are cheap and quiet-season runs are one JSON fetch); **prefer the simple year-round 30-min cron** per "simplest solution first".

- [ ] **Step 1: Write workflow + README + .gitignore.**
- [ ] **Step 2: CHECKPOINT — confirm with the user**: GitHub org (`AH-Datalytics` vs `Jeff-alytics`) and repo visibility. Then `gh repo create <org>/gulf-watch --private --source . --push`, add the two secrets (`gh secret set`).
- [ ] **Step 3: Trigger `workflow_dispatch`, verify green run and fresh `manifest.json` timestamp.** Commit `ci: scheduled ingest workflow`.

---

### Task 7: Next.js scaffold, design tokens, data layer, demo mode

**Files:**
- Create: `web/` via `npx create-next-app@latest web --ts --app --no-tailwind --eslint --src-dir --import-alias "@/*"`; then `web/src/lib/types.ts`, `web/src/lib/useDashboard.ts`, `web/src/app/globals.css` (replace), `web/src/lib/format.ts`, `web/public/demo/` fixtures, `web/src/lib/config.ts`
- Test: `web/src/lib/__tests__/format.test.ts` (vitest — add `vitest` dev dep + `"test": "vitest run"` script)

**Interfaces (consumed by Tasks 8–12):**
```ts
// types.ts — mirror the manifest contract exactly
export type Mode = "quiet" | "active";
export interface StormEntry { id: string; name: string; classification: string;
  intensityMph: number; pressureMb: number; movementDir: string; movementMph: number;
  lat: number; lon: number; advisoryNum: string; advisoryTime: string;
  nextAdvisoryTime: string; inGulfBox: boolean; modelCycle: string;
  files: Record<"cone"|"track"|"wwlines"|"models"|"intensity", string>; }
export interface Manifest { generated: string; mode: Mode; storms: StormEntry[];
  outlook: { geojson: string; text: string; issued: string }; errors: {product: string; message: string}[]; }

// useDashboard.ts
export function useDashboard(): {
  manifest: Manifest | null; mode: Mode; demo: boolean;
  storm: StormEntry | null;              // strongest inGulfBox storm, else strongest storm, else null
  geo: { cone?: GeoJSON.FeatureCollection; track?: GeoJSON.FeatureCollection;
         wwlines?: GeoJSON.FeatureCollection; models?: GeoJSON.FeatureCollection;
         outlook?: GeoJSON.FeatureCollection };
  intensity: IntensitySeries | null; outlookText: { issued: string; text: string } | null;
  stale: boolean;                        // per spec: >8h active, >26h quiet
}
```
- `config.ts`: `BLOB_BASE = process.env.NEXT_PUBLIC_BLOB_BASE_URL`; demo mode: `useSearchParams` `?demo=1` → all fetches read `/demo/*.json` instead of Blob.
- `format.ts` pure helpers (unit-tested): `categoryFor(mph): "TD"|"TS"|"1".."5"`, `cdtTime(iso): string` (America/Chicago, e.g. "4:00 PM CDT"), `countdown(toIso): string` ("T−2:41").
- **Design tokens** in `globals.css`: two blocks, `[data-mode="quiet"]` and `[data-mode="active"]`, defining `--bg --panel --ink --ink-dim --accent --rule --water --land --coast --grid` etc. **Copy every hex from the mockup's `.quiet` and `.active` CSS** (`docs/superpowers/specs/two-moods-v2-mockup.html`). Root layout sets `data-mode` from `useDashboard().mode`.
- **Demo fixtures** (`web/public/demo/`): `manifest.json` (active mode, storm "Solene" al992026), `cone.geojson`, `track.geojson`, `wwlines.geojson`, `models.geojson`, `intensity.json` — generate by converting the mockup's SVG coordinates back to plausible Gulf lat/lons (hand-write ~5 track points from 25N 85W to 30N 90.5W, cone polygon around them, 8 model lines, intensity series matching the mockup chart). Also `manifest-quiet.json` + `outlook.geojson`/`outlook.json` for `?demo=quiet`.

- [ ] **Step 1: Scaffold app, add deps** (`maplibre-gl`, `recharts`, `swr`, dev `vitest`). Verify `npm run dev` serves.
- [ ] **Step 2: Failing vitest** for `format.ts` (thresholds: 73→TS, 74→"1", 96→"2"; countdown math; CDT rendering with a fixed date).
- [ ] **Step 3: Implement types/config/format/useDashboard + globals tokens + demo fixtures.** Page renders `<pre>` dump of `useDashboard()` for now in both `?demo=1` and `?demo=quiet`.
- [ ] **Step 4: `npm run test` + `npx tsc --noEmit` green; verify dump in browser both modes; commit** `feat: web scaffold, data layer, design tokens, demo mode`.

---

### Task 8: Map — self-contained cartography + storm layers

**Files:**
- Create: `web/src/components/StormMap.tsx`, `web/src/lib/mapStyle.ts`, `web/public/geo/gulf_land.json`; Modify: `web/src/app/page.tsx` (layout: rail + mapcol as in mockup)

**Basemap approach (no tile provider):** download Natural Earth 50m land GeoJSON once (`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson`), clip to bbox lon −100..−72, lat 15..33 with a small Node script (keep features intersecting bbox; fine to keep whole features), commit as `gulf_land.json` (~ a few hundred KB). Map style is built in `mapStyle.ts`: background = `--water`, land fill/line from tokens, graticule as a generated 2° GeoJSON grid line source, labels via symbol layers. **Both modes restyle via `map.setPaintProperty` on mode change — colors come from the same token values (read via `getComputedStyle`).**

**Interfaces:**
- `<StormMap geo={...} mode={mode} visibleModels={Set<string>} showRadar={boolean} />` — renders layers: land, graticule, outlook areas (quiet: hatched fill via `fill-pattern` from a tiny generated canvas image, labels "20% · 7-DAY"), cone (fill `--accent-cone` at 0.10 + dashed line), official track (white 2.2px + circle points + `CAT 2 · WED 1PM`-style symbol labels from track point properties), wwlines colored by `STORMTYPE`/`TCWW` property (hurricane warning `#d94141`, hurricane watch `#e8a1a1`, TS warning `#4a7fd4`, TS watch `#9dbdf0`), model spaghetti (line color per model from a `MODEL_COLORS` map copied from mockup legend; `kind === "ai"` gets `line-dasharray: [2,2]`; filtered by `visibleModels`), radar raster (WMS template from Shared Contracts, `visibility` toggled), NOLA marker + label at 29.95, −90.07. Initial bounds: lon −98..−80, lat 18..31, padded.
- Produces: `MODEL_COLORS: Record<string, string>` exported for the Task 9 legend.

- [ ] **Step 1: Write the clip script, generate + commit `gulf_land.json`.** Eyeball the Gulf coastline renders (Florida, LA boot, Yucatán present).
- [ ] **Step 2: Implement mapStyle + StormMap with demo data; verify in browser** at `?demo=1` (cone/track/spaghetti/ww render, AI dashed) and `?demo=quiet` (paper map, hatched genesis areas). Type-check green.
- [ ] **Step 3: Commit** `feat: MapLibre two-mood map with storm and outlook layers`.

---

### Task 9: Left rail — storm header, alerts, legend, quiet rail

**Files:**
- Create: `web/src/components/Rail.tsx`, `web/src/components/StormHeader.tsx`, `web/src/components/Alerts.tsx`, `web/src/components/ModelLegend.tsx`, `web/src/components/OutlookPanel.tsx`; Modify: `web/src/app/page.tsx`
- Test: `web/src/lib/__tests__/alerts.test.ts`

**Interfaces:**
- `Alerts`: fetches NWS alerts URL from Shared Contracts every 5 min (SWR), pure helper `filterMetroAlerts(features): AlertRow[]` (unit-tested; filter by SAME codes, dedupe by event+area, sort severity: Warning > Watch > Advisory; map event → border color: contains "Hurricane Warning" `#d94141`, "Storm Surge" `#b04fd6`, "Tropical Storm" `#4a7fd4`, else `--rule`). Quiet mode: section renders only if alerts exist.
- `StormHeader`: name + `CAT n` chip + stats grid (winds/pressure/motion) + advisory line with live countdown (1 s interval) — exact layout/typography per mockup `.storm-name/.stats/.adv`.
- `ModelLegend`: reads `MODEL_COLORS`, groups Physics / AI Guidance (dashed swatches), checkboxes drive `visibleModels` state lifted in `page.tsx`; "Consensus only" quick filter; DSHP/LGEM never listed (INTENSITY_ONLY).
- `OutlookPanel` (quiet): serif status line "No active systems", TWO text, issued/next times (TWO issues 1AM/7AM/1PM/7PM CDT — next = next of those).
- `page.tsx` composes: masthead (quiet serif variant / active caps variant + red warn chip when any Hurricane Warning alert active), rail, mapcol, disclaimer footer, staleness banner (`stale` from useDashboard), "SIMULATED STORM — DEMO DATA" tag when `demo`.

- [ ] **Step 1: Failing vitest for `filterMetroAlerts`** (fixture JSON with an Orleans warning, a non-metro parish alert, a duplicate).
- [ ] **Step 2: Implement components; verify in browser** both demo modes against the mockup side-by-side (spacing, colors, casing). Type-check + tests green.
- [ ] **Step 3: Commit** `feat: rail with alerts, storm header, model legend, quiet outlook`.

---

### Task 10: Live tide gauges

**Files:**
- Create: `web/src/components/Gauges.tsx`, `web/src/lib/coops.ts`; Test: `web/src/lib/__tests__/coops.test.ts`

**Interfaces:**
- `coops.ts`: `fetchGauge(stationId): Promise<GaugeSeries>` (water_level + predictions per Shared Contracts URL; predictions failure → observed only), pure `toSeries(waterJson, predJson | null): GaugeSeries = { points: {t: string; obs: number; pred?: number}[]; latest: number; departure: number | null }` (departure = latest obs − latest pred). Unit-test `toSeries` with committed fixture JSON (fetch real responses once, commit).
- `Gauges.tsx`: three stations (New Canal, Shell Beach, Grand Isle), Recharts sparklines ~44px high: observed line (`--accent` quiet / `#ff9a5c` active), predicted band when available; header row per mockup (`name … +3.1 ft ↑`); refresh every 6 min; per-gauge "unavailable" state on fetch error.

- [ ] **Step 1: Commit CO-OPS fixtures; failing vitest for `toSeries`** (departure math, missing-predictions null, empty data).
- [ ] **Step 2: Implement; verify live data renders in browser** (these APIs are live regardless of season). Green, commit `feat: live tide gauge sparklines`.

---

### Task 11: Intensity guidance panel

**Files:**
- Create: `web/src/components/IntensityPanel.tsx`; Modify: `web/src/app/page.tsx` (render under map, active mode only)

**Interfaces:**
- Consumes `intensity: IntensitySeries` (Task 7) + `visibleModels` + `MODEL_COLORS`. Recharts LineChart: x = tau hours rendered as CDT day/time ticks (advisoryTime + tauH), y = mph starting at 0 with round 25-mph intervals; shaded `ReferenceArea` bands between category thresholds with right-edge labels TS/CAT 1–4 (colors from mockup `.ipanel` rects); one Line per series — official white 2.4px with dots, physics 1.2px, AI dashed; DSHP/LGEM included here (they're intensity models) with their own colors added to `MODEL_COLORS`; landfall `ReferenceLine` at the first track tau whose point is over land — **v1 simplification: mark at the tau where the official track first crosses lat 29.2 headed north, else omit**; panel header per mockup (`.ipanel .head`).

- [ ] **Step 1: Implement against demo fixture; verify in browser** matches mockup register (bands, white official line, dashed AI). Type-check green.
- [ ] **Step 2: Commit** `feat: intensity guidance panel`.

---

### Task 12: Quiet-mode finish, responsive, meta

**Files:**
- Modify: `web/src/components/StormMap.tsx` (compass rose + italic map plate as HTML overlays, quiet only), `web/src/app/globals.css` (mobile: ≤820px rail stacks below map, map 55vh), `web/src/app/layout.tsx` (title "The Gulf Watch — New Orleans Tropical Weather", description, `icon.png` = AHD navy triangle favicon copied from `ah-datalytics-site/src/app/icon.png`)

- [ ] **Step 1: Implement; verify** desktop + narrow-window layouts in browser, both demo modes; confirm favicon, no portal header bar (standing rule), disclaimer visible both modes.
- [ ] **Step 2: Commit** `feat: quiet-mode polish, responsive layout, site meta`.

---

### Task 13: Deploy + end-to-end verification

**Files:** none new (Vercel project settings)

- [ ] **Step 1: CHECKPOINT — confirm with the user** the Vercel scope + project name before creating. Git-connected project (root `web/`), env var `NEXT_PUBLIC_BLOB_BASE_URL`. **Push to deploy — never CLI-deploy** (git-connected projects revert CLI deploys).
- [ ] **Step 2: Playwright verification** (playwright-skill) against the production URL: `/?demo=1` → active-mode assertions (navy bg token, cone layer canvas present, alerts section, intensity panel, SIMULATED tag); `/?demo=quiet` → paper bg, genesis areas, serif masthead; `/` (real data) → mode matches actual NHC state, gauges show numbers, no console errors. Screenshots of all three for the user.
- [ ] **Step 3: Run one full live ingest → confirm site reflects fresh manifest timestamp. Report results with screenshots; do not claim done without them.**

---

## Self-Review Notes (performed at plan time)

- Spec coverage: map ✓(T8), intensity ✓(T11), live conditions ✓(T9,T10), quiet mode ✓(T3,T8,T9,T12), AI guidance ✓(T5,T8,T11), two moods ✓(T7,T8), mode rule ✓(T2,T4), error handling ✓(T4 + per-component states T9/T10), demo mode ✓(T7), staleness banner ✓(T7,T9), disclaimer ✓(T9), deployment ✓(T6,T13).
- Known deliberate simplifications: landfall marker heuristic (T11); year-round 30-min cron (T6); AIFS may ship stubbed (T5 spike rule).
- Type consistency: manifest/StormEntry/IntensitySeries defined once in Shared Contracts and Task 7; `MODEL_COLORS` produced T8, consumed T9/T11; `visibleModels` lifted in page.tsx (T8 prop, T9 control).
