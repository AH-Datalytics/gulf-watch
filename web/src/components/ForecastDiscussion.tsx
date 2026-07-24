"use client";

import { useMemo } from "react";
import { discussionParagraphs } from "@/lib/discussion";
import { cdtTime } from "@/lib/format";
import type { TextProduct } from "@/lib/types";

export interface ForecastDiscussionProps {
  discussion: TextProduct | null;
  onClose: () => void;
}

/** Full NHC technical discussion shown as a dedicated map pop-out. */
export function ForecastDiscussion({ discussion, onClose }: ForecastDiscussionProps) {
  const paragraphs = useMemo(
    () => (discussion ? discussionParagraphs(discussion.text) : []),
    [discussion]
  );

  if (!discussion || paragraphs.length === 0) return null;

  return (
    <section className="forecast-discussion-card" role="dialog" aria-labelledby="forecast-discussion-title">
      <header>
        <div>
          <div className="kicker">National Hurricane Center</div>
          <h2 id="forecast-discussion-title">Forecast discussion</h2>
          <span>Issued {cdtTime(discussion.issued)}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close forecast discussion">×</button>
      </header>
      <div className="forecast-discussion-copy">
        {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </div>
    </section>
  );
}
