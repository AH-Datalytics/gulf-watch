# Gulf Watch v2 Redesign Addendum (supersedes two-moods design)

User verdict on v1: too dark; map must feel like a real map; gauges unwanted; core want = ALL NHC graphics/data, easy to digest, re-rendered natively.

Decisions (user, 2026-07-24):
- Basemap: satellite/terrain imagery (Esri World Imagery raster tiles + Esri reference-label overlay tiles; attribution required)
- One light editorial look year-round; two-mood concept DROPPED (mode still switches CONTENT: outlook vs storm)
- Native interactive rendering of NHC products (no embedded NHC PNGs)
- Water level gauges REMOVED entirely. NDBC buoys remain cut.

Round 1 (relight, this round): satellite basemap + label overlay; light rail/panels (cream/white editorial, navy accents, existing quiet-mode token family as base); remove Gauges + coops; keep alerts, storm header, model legend, intensity panel (light restyle), multi-storm cones, radar toggle; add per-storm NHC text products (forecast discussion + public advisory) — ingest fetches both texts per advisory into storms/{id}/text.json, rail gets collapsible "Forecast Discussion" section.
Round 2 (NHC product buildout, next): wind-speed probability map layer + NOLA point probabilities (PWS), TS-wind arrival time layer, WPC rainfall/QPF layer, storm surge products when in effect. Each native from GIS/GRIB-derived data via the existing pipeline.
