"use client";

import { useEffect, useState } from "react";
import type { StormEntry } from "@/lib/types";
import { categoryFor, cdtDateTime, cdtTime, countdown, stormTypeLabel } from "@/lib/format";

/** Ticks once a second so the advisory countdown stays live without a page reload. */
function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** "Category 2" for numeric categories, "TS"/"TD" as-is otherwise. */
function catChipText(intensityMph: number): string {
  const cat = categoryFor(intensityMph);
  return /^\d$/.test(cat) ? `Category ${cat}` : cat;
}

export interface StormHeaderProps {
  storm: StormEntry;
}

export function StormHeader({ storm }: StormHeaderProps) {
  const now = useNow(1000);

  return (
    <div className="storm-summary">
      <div className="storm-name">
        {stormTypeLabel(storm.classification)} {storm.name}
        <span className="cat">{catChipText(storm.intensityMph)}</span>
      </div>
      <div className="storm-meta-list">
        <div className="storm-meta-row">
          <span className="storm-meta-icon" aria-hidden="true">≋</span>
          <span className="storm-meta-label">Winds</span>
          <b className="num">{storm.intensityMph} <small>mph</small></b>
        </div>
        <div className="storm-meta-row">
          <span className="storm-meta-icon" aria-hidden="true">◉</span>
          <span className="storm-meta-label">Pressure</span>
          <b className="num">{storm.pressureMb} <small>mb</small></b>
        </div>
        <div className="storm-meta-row">
          <span className="storm-meta-icon" aria-hidden="true">↗</span>
          <span className="storm-meta-label">Motion</span>
          <b className="num">{storm.movementDir} at {storm.movementMph} <small>mph</small></b>
        </div>
        <div className="storm-meta-row storm-advisory-row">
          <span className="storm-meta-icon" aria-hidden="true">▣</span>
          <span className="storm-meta-label">Advisory</span>
          <b>{storm.advisoryNum} · {cdtDateTime(storm.advisoryTime)}</b>
        </div>
        <div className="storm-meta-row">
          <span className="storm-meta-icon" aria-hidden="true">◷</span>
          <span className="storm-meta-label">Next update</span>
          <b title={countdown(storm.nextAdvisoryTime, now)}>{cdtTime(storm.nextAdvisoryTime)}</b>
        </div>
      </div>
    </div>
  );
}
