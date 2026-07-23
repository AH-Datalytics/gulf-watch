# The Gulf Watch

A New Orleans-focused tropical weather dashboard from AH Datalytics. The site
runs in two modes: a quiet "nothing's happening" view when there is no
storm near the Gulf, and an active-storm view with cone, track, model
spread, watches/warnings, and local tide/radar context once a system enters
the Gulf box.

**Not an official forecast.** For decisions, consult the National Hurricane
Center and NWS New Orleans/Baton Rouge.

## Architecture

A scheduled GitHub Actions job runs a Python ingest pipeline every 30
minutes, pulling NHC current-storms data, cone/track/watch-warning
shapefiles, A-deck model tracks, and the Atlantic tropical weather outlook;
it normalizes everything into GeoJSON/JSON and uploads it to Vercel Blob,
along with a `manifest.json` that indexes the current mode and any active
storms. The Next.js/MapLibre frontend reads that manifest and its
referenced blob files to render the map and panels, and separately fetches
a few things live, client-side, straight from public NOAA APIs: NWS alerts,
NOAA CO-OPS tide gauge data, and IEM NEXRAD radar tiles.

## Running the ingest locally

```
cd ingest
pip install -r requirements.txt
python ingest.py
```

Requires two environment variables (e.g. in `ingest/.env.local`, not
committed):

- `BLOB_READ_WRITE_TOKEN` - Vercel Blob read/write token
- `BLOB_BASE_URL` - base URL of the Vercel Blob store

The script prints a summary line (`mode`, storm count, error count) and
exits non-zero only if the whole run fails; per-product failures are
recorded in `manifest.json`'s `errors` list instead of crashing the run.

## Running the tests

```
python -m pytest ingest/tests/ -q
```

## Data sources and credits

- National Hurricane Center (NHC) - current storms, cone/track/watch-warning
  graphics, A-deck model guidance, tropical weather outlook
- National Weather Service (NWS) - active alerts
- NOAA CO-OPS - tide gauge observations and predictions
- Iowa Environmental Mesonet (IEM) - NEXRAD radar tiles
