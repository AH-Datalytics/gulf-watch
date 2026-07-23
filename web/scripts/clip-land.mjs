#!/usr/bin/env node
// Downloads Natural Earth 50m land polygons and clips to the Gulf/Caribbean
// region so the map bundle doesn't ship the whole world. Run once (output is
// committed to web/public/geo/gulf_land.json); re-run only if Natural Earth
// data needs refreshing. Node 18+ (built-in fetch), zero dependencies.
//
// Usage: node web/scripts/clip-land.mjs

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SOURCE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson";

// Gulf of Mexico + western Caribbean + Yucatan/Florida/Louisiana/Texas box.
const BBOX = { lonMin: -100, lonMax: -72, latMin: 15, latMax: 33 };

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "public", "geo", "gulf_land.json");

/** Recursively walk a GeoJSON coordinates array, collecting [lon, lat] pairs. */
function* eachPosition(coords) {
  if (typeof coords[0] === "number") {
    yield coords;
    return;
  }
  for (const c of coords) yield* eachPosition(c);
}

/** True if any vertex of the feature's geometry falls inside the bbox. */
function intersectsBbox(feature, bbox) {
  const geom = feature.geometry;
  if (!geom) return false;
  for (const [lon, lat] of eachPosition(geom.coordinates)) {
    if (lon >= bbox.lonMin && lon <= bbox.lonMax && lat >= bbox.latMin && lat <= bbox.latMax) {
      return true;
    }
  }
  return false;
}

async function main() {
  console.log(`Fetching ${SOURCE_URL} ...`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Natural Earth land data: ${res.status} ${res.statusText}`);
  }
  const world = await res.json();
  console.log(`Downloaded ${world.features.length} world land features.`);

  const clipped = world.features.filter((f) => intersectsBbox(f, BBOX));
  console.log(`Keeping ${clipped.length} features intersecting bbox`, BBOX);

  const out = { type: "FeatureCollection", features: clipped };
  await writeFile(OUT_PATH, JSON.stringify(out));
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
