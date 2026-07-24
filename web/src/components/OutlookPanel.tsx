"use client";

import { cdtTime, nextOutlookIssueTime } from "@/lib/format";

export interface OutlookPanelProps {
  outlookText: { issued: string; text: string } | null;
}

// NHC's real Tropical Weather Outlook prose spells out "NN percent" (confirmed
// by the demo fixture's wording); also match a bare "NN%" defensively.
const PERCENT_RE = /(\d+\s*(?:%|percent))/gi;

function withBoldPercentages(text: string) {
  return text.split(PERCENT_RE).map((part, i) =>
    /^\d+\s*(?:%|percent)$/i.test(part) ? <b key={i}>{part}</b> : <span key={i}>{part}</span>
  );
}

/** Quiet-mode rail content: "no active systems" status + the 7-day genesis outlook prose. */
export function OutlookPanel({ outlookText }: OutlookPanelProps) {
  return (
    <>
      <div>
        <div className="status">
          <span className="ok" />
          No active systems
        </div>
        {outlookText && (
          <div className="issued">
            Tropical weather outlook · issued {cdtTime(outlookText.issued)} · next update{" "}
            {nextOutlookIssueTime(outlookText.issued)}
          </div>
        )}
      </div>
      {outlookText && (
        <div>
          <div className="kicker">Seven-day outlook</div>
          <div className="body-text">{withBoldPercentages(outlookText.text)}</div>
        </div>
      )}
    </>
  );
}
