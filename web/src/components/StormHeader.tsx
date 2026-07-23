"use client";

import { useEffect, useState } from "react";
import type { StormEntry } from "@/lib/types";
import { categoryFor, cdtTime, countdown, stormTypeLabel } from "@/lib/format";

/** Ticks once a second so the advisory countdown stays live without a page reload. */
function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** "CAT 2" for numeric categories, "TS"/"TD" as-is otherwise. */
function catChipText(intensityMph: number): string {
  const cat = categoryFor(intensityMph);
  return /^\d$/.test(cat) ? `CAT ${cat}` : cat;
}

export interface StormHeaderProps {
  storm: StormEntry;
}

export function StormHeader({ storm }: StormHeaderProps) {
  const now = useNow(1000);

  return (
    <div>
      <div className="storm-name">
        {stormTypeLabel(storm.classification)} {storm.name}
        <span className="cat">{catChipText(storm.intensityMph)}</span>
      </div>
      <div className="stats">
        <div>
          <div className="l">Winds</div>
          <div className="v num">
            {storm.intensityMph} <span className="unit">mph</span>
          </div>
        </div>
        <div>
          <div className="l">Pressure</div>
          <div className="v num">
            {storm.pressureMb} <span className="unit">mb</span>
          </div>
        </div>
        <div>
          <div className="l">Motion</div>
          <div className="v num">
            {storm.movementDir} {storm.movementMph}
          </div>
        </div>
      </div>
      <div className="adv num">
        ADVISORY {storm.advisoryNum} · {cdtTime(storm.advisoryTime)} · NEXT{" "}
        <b>{cdtTime(storm.nextAdvisoryTime)}</b> ({countdown(storm.nextAdvisoryTime, now)})
      </div>
    </div>
  );
}
