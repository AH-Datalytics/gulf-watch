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
  // map and rail products together instead of briefly showing empty layers.
  useEffect(() => {
    const next = advisories[currentIndex + 1];
    if (!next) return;
    const paths = [
      ...Object.values(next.files),
      ...(next.satellite ? [next.satellite.image] : []),
    ];
    for (const path of paths) {
      void fetch(`/demo/${path}`, { cache: "force-cache" }).catch(() => undefined);
    }
  }, [advisories, currentIndex]);

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
        <div className="advisory-ticks" role="group" aria-label="Choose an advisory">
          {advisories.map((advisory, index) => (
            <button
              type="button"
              key={advisory.advisoryNum}
              className={index === currentIndex ? "active" : ""}
              onClick={() => choose(index)}
              aria-label={`Advisory ${advisory.advisoryNum}, ${cdtDateTime(advisory.advisoryTime)}`}
              aria-current={index === currentIndex ? "step" : undefined}
            >
              <i aria-hidden="true" />
              <span>{advisory.advisoryNum}</span>
            </button>
          ))}
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
