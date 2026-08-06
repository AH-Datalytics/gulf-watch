"use client";

import { useEffect, useState } from "react";
import { cdtDateTime } from "@/lib/format";
import type { StormEntry } from "@/lib/types";

export interface AdvisoryPlaybackProps {
  advisories: StormEntry[];
  currentIndex: number;
  onSelect: (index: number) => void;
}

const FRAME_MS = 1800;

export function AdvisoryPlayback({
  advisories,
  currentIndex,
  onSelect,
}: AdvisoryPlaybackProps) {
  const [playing, setPlaying] = useState(false);
  const lastIndex = advisories.length - 1;
  const current = advisories[currentIndex];

  // Warm the browser cache one frame ahead so a playing replay changes all
  // essential map products together. Do not preload before Play: the large
  // optional wind-probability and satellite files made the initial Ida view
  // compete with an advisory the viewer had not requested yet.
  useEffect(() => {
    if (!playing) return;
    const next = advisories[currentIndex + 1];
    if (!next) return;
    const paths = [
      ...Object.values(next.files),
      ...(next.satellite ? [next.satellite.image] : []),
      ...(next.radar ? [next.radar.image] : []),
    ];
    for (const path of paths) {
      void fetch(`/demo/${path}`, { cache: "force-cache" }).catch(() => undefined);
    }
  }, [advisories, currentIndex, playing]);

  useEffect(() => {
    if (!playing || currentIndex >= lastIndex) return;
    const timeout = window.setTimeout(() => {
      const nextIndex = currentIndex + 1;
      onSelect(nextIndex);
      if (nextIndex === lastIndex) setPlaying(false);
    }, FRAME_MS);
    return () => window.clearTimeout(timeout);
  }, [currentIndex, lastIndex, onSelect, playing]);

  if (!current || advisories.length < 2) return null;

  const choose = (index: number) => {
    setPlaying(false);
    onSelect(index);
  };

  const togglePlayback = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (currentIndex === lastIndex) onSelect(0);
    setPlaying(true);
  };

  return (
    <section className="advisory-playback" aria-label="Hurricane Ida advisory replay">
      <div className="advisory-playback-status" aria-live="polite">
        <span>Ida forecast replay</span>
        <b>Advisory {current.advisoryNum}</b>
        <time dateTime={current.advisoryTime}>{cdtDateTime(current.advisoryTime)}</time>
      </div>
      <div className="advisory-playback-controls">
        <button
          type="button"
          className="advisory-step"
          onClick={() => choose(Math.max(0, currentIndex - 1))}
          disabled={currentIndex === 0}
          aria-label="Previous advisory"
        >
          ‹
        </button>
        <button
          type="button"
          className="advisory-play"
          onClick={togglePlayback}
          aria-label={playing ? "Pause advisory replay" : "Play advisory replay"}
          aria-pressed={playing}
        >
          <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
        </button>
        <div className="advisory-timeline">
          <input
            type="range"
            min={0}
            max={lastIndex}
            step={1}
            value={currentIndex}
            onChange={(event) => choose(Number(event.target.value))}
            aria-label="Choose an advisory"
            aria-valuetext={`Advisory ${current.advisoryNum}, ${cdtDateTime(current.advisoryTime)}`}
          />
          <div className="advisory-range-labels" aria-hidden="true">
            <span>Adv {advisories[0].advisoryNum}</span>
            <b>{currentIndex + 1} of {advisories.length}</b>
            <span>Adv {advisories[lastIndex].advisoryNum}</span>
          </div>
        </div>
        <button
          type="button"
          className="advisory-step"
          onClick={() => choose(Math.min(lastIndex, currentIndex + 1))}
          disabled={currentIndex === lastIndex}
          aria-label="Next advisory"
        >
          ›
        </button>
      </div>
    </section>
  );
}
