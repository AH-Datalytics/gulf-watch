"use client";

import { useMemo, useState } from "react";
import { discussionParagraphs } from "@/lib/discussion";
import { cdtTime } from "@/lib/format";
import type { TextProduct } from "@/lib/types";

export interface ForecastDiscussionProps {
  /** The `discussion` product from storms/{id}/text.json — null while
   *  loading or if it failed to fetch/build for this advisory. */
  discussion: TextProduct | null;
}

/**
 * Collapsible Forecast Discussion — collapsed by default showing just the
 * first narrative paragraph, expandable to the full text (scrolls
 * internally rather than growing the rail without bound). Plain prose
 * styling, not a monospace terminal block — see globals.css's
 * .discussion-body.
 */
export function ForecastDiscussion({ discussion }: ForecastDiscussionProps) {
  const [expanded, setExpanded] = useState(false);
  const paragraphs = useMemo(
    () => (discussion ? discussionParagraphs(discussion.text) : []),
    [discussion]
  );

  if (!discussion || paragraphs.length === 0) return null;

  const shown = expanded ? paragraphs : paragraphs.slice(0, 1);

  return (
    <div>
      <div className="kicker">Forecast discussion</div>
      <div className="discussion-byline">Issued {cdtTime(discussion.issued)}</div>
      <div className={`discussion-body${expanded ? " expanded" : ""}`}>
        {shown.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {paragraphs.length > 1 && (
        <button type="button" className="text-link" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show less" : "Read full discussion"}
        </button>
      )}
    </div>
  );
}
