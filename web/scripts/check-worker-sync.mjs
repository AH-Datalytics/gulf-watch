#!/usr/bin/env node
// Guards against a silent, hours-to-debug failure mode: maplibre-gl resolves
// its worker script relative to its own module's import.meta.url, which
// breaks under Turbopack (see StormMap.tsx's comment + task-8-report.md for
// the full root-cause) — the fix is a static copy of the worker + its shared
// chunk in web/public/. If maplibre-gl is ever upgraded without re-copying
// those files, the map silently hangs (no error, no thrown exception —
// map.on('load'/'idle', ...) just never fires) instead of failing loudly.
//
// This script byte-compares (CRLF-normalized, so a Windows checkout doesn't
// false-positive) each public/ copy against its node_modules original and
// exits 1 with a fix command if anything drifted or is missing. Wired as
// "predev"/"prebuild" so `npm run dev`/`npm run build` catch it immediately.
//
// Usage: node web/scripts/check-worker-sync.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PAIRS = [
  {
    installed: join(ROOT, "node_modules", "maplibre-gl", "dist", "maplibre-gl-worker.mjs"),
    copied: join(ROOT, "public", "maplibre-gl-worker.mjs"),
  },
  {
    installed: join(ROOT, "node_modules", "maplibre-gl", "dist", "maplibre-gl-shared.mjs"),
    copied: join(ROOT, "public", "maplibre-gl-shared.mjs"),
  },
];

function normalize(buf) {
  return buf.toString("utf8").replace(/\r\n/g, "\n");
}

function readOrNull(path) {
  try {
    return normalize(readFileSync(path));
  } catch {
    return null;
  }
}

let ok = true;

for (const { installed, copied } of PAIRS) {
  const installedContent = readOrNull(installed);
  const copiedContent = readOrNull(copied);

  if (installedContent === null) {
    // maplibre-gl isn't installed (e.g. a check run before `npm install`) —
    // nothing to compare against; not this script's problem to report.
    continue;
  }

  if (copiedContent === null) {
    console.error(`check-worker-sync: missing public copy: ${copied}`);
    console.error(`  FIX: cp "${installed}" "${copied}"`);
    ok = false;
    continue;
  }

  if (installedContent !== copiedContent) {
    console.error(
      `check-worker-sync: OUT OF SYNC — ${copied} does not match the installed ${installed}.`
    );
    console.error(
      "  Left uncorrected, this silently hangs the map (no error thrown; MapLibre's"
    );
    console.error(
      "  'load'/'idle' events never fire) whenever maplibre-gl's worker-URL resolution"
    );
    console.error("  breaks under Turbopack. See web/src/components/StormMap.tsx's comment.");
    console.error(`  FIX: cp "${installed}" "${copied}"`);
    ok = false;
  }
}

if (!ok) {
  process.exit(1);
}

console.log("check-worker-sync: OK — public/ maplibre worker copies match node_modules/maplibre-gl.");
