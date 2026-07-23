# Gulf Watch v2 Redesign Addendum (supersedes two-moods design)

User verdict on v1: too dark; map must feel like a real map; gauges unwanted; core want = ALL NHC graphics/data, easy to digest, re-rendered natively.

Decisions (user, 2026-07-24):
- Basemap: satellite/terrain imagery (Esri World Imagery raster tiles + Esri reference-label overlay tiles; attribution required)
- One light editorial look year-round; two-mood concept DROPPED (mode still switches CONTENT: outlook vs storm)
- Native interactive rendering of NHC products (no embedded NHC PNGs)
- Water level gauges REMOVED entirely. NDBC buoys remain cut.

Round 1 (relight, this round): satellite basemap + label overlay; light rail/panels (cream/white editorial, navy accents, existing quiet-mode token family as base); remove Gauges + coops; keep alerts, storm header, model legend, intensity panel (light restyle), multi-storm cones, radar toggle; add per-storm NHC text products (forecast discussion + public advisory) — ingest fetches both texts per advisory into storms/{id}/text.json, rail gets collapsible "Forecast Discussion" section.
Round 2 (NHC product buildout, next): wind-speed probability map layer + NOLA point probabilities (PWS), TS-wind arrival time layer, WPC rainfall/QPF layer, storm surge products when in effect. Each native from GIS/GRIB-derived data via the existing pipeline.

User additions (same day): Round 1 MUST also include (a) wind speed probabilities — parse the PWS text product (windSpeedProbabilities URL in CurrentStorms.json) for the NEW ORLEANS LA row; ingest -> storms/{id}/probs.json; rail hero stat "Chance of TS-force / hurricane-force winds at New Orleans: X% / Y%" + small table of nearby points (Grand Isle, Houma, Slidell, Gulfport if present); (b) intensity panel is too short to read — raise to ~320px with a VISIBLE y-axis (mph labels, gridlines at 25-mph steps), larger fonts.

Round 2 (user, 2026-07-24): FLAGSHIP SAMPLE = Hurricane Ida, Aug 27 2021 (al092021, advisory ~7 evening). Build /demo/ida from archives: NHC GIS archive (cone/track/ww), ATCF archive a-deck aal092021.dat.gz (FULL model set — expand whitelist to all quality aids INCLUDING GEFS/ECMWF ensemble members, grouped legend: official/deterministic/consensus/ensembles-thin, group toggles), archived PWS text (wind probs), archived WPC QPF for rain (live storms use api.weather.gov PoP instead). Required toggleable layers/graphs: cone, models (full spaghetti), intensity graph, % chance rain, % chance TS/hurricane winds. Unified layers control on map + graphs toggleable. Solene fictional demo RETIRED once Ida sample lands (bertha replay stays).
