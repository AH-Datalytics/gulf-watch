// Mirrors the manifest contract exactly. See .superpowers/sdd/shared-contracts.md.

export type Mode = "quiet" | "active";

export interface StormEntry {
  id: string;
  name: string;
  classification: string;
  intensityMph: number;
  pressureMb: number;
  movementDir: string;
  movementMph: number;
  lat: number;
  lon: number;
  advisoryNum: string;
  advisoryTime: string;
  nextAdvisoryTime: string;
  inGulfBox: boolean;
  modelCycle: string;
  files: Record<"cone" | "track" | "wwlines" | "models" | "intensity", string>;
}

export interface Manifest {
  generated: string;
  mode: Mode;
  storms: StormEntry[];
  outlook: { geojson: string; text: string; issued: string };
  errors: { product: string; message: string }[];
}

export interface IntensityPoint {
  tauH: number;
  mph: number;
}

export interface IntensitySeriesEntry {
  model: string;
  label: string;
  kind: "official" | "physics" | "ai" | "consensus";
  points: IntensityPoint[];
}

export interface IntensitySeries {
  cycle: string;
  series: IntensitySeriesEntry[];
}
