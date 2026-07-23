"use client";

import useSWR from "swr";
import type { Mode } from "@/lib/types";
import { ALERTS_URL, alertsFetcher, filterMetroAlerts, type AlertRow } from "@/lib/alerts";

const REFRESH_MS = 5 * 60 * 1000;

/**
 * Shared metro-alerts fetch, keyed on `ALERTS_URL` — SWR dedupes this across
 * every call site (this component and page.tsx's masthead warn-chip check),
 * so using the hook from both places costs one network request, not two.
 */
export function useMetroAlerts(): AlertRow[] {
  const { data } = useSWR(ALERTS_URL, alertsFetcher, { refreshInterval: REFRESH_MS });
  return filterMetroAlerts(data?.features ?? []);
}

export interface AlertsProps {
  mode: Mode;
}

/**
 * NWS active-alerts panel for the metro parishes. Quiet mode hides the whole
 * section when there's nothing active (per the brief); active mode always
 * shows the kicker, with a fallback line when there's genuinely nothing.
 */
export function Alerts({ mode }: AlertsProps) {
  const rows = useMetroAlerts();

  if (mode === "quiet" && rows.length === 0) return null;

  return (
    <div>
      <div className="kicker">Watches &amp; Warnings — Metro Parishes</div>
      {rows.length === 0 ? (
        <p className="body-text">No active watches or warnings for the metro parishes.</p>
      ) : (
        rows.map((row) => (
          <div key={row.key} className="alert" style={{ borderLeftColor: row.color }}>
            <b>{row.event}</b>
            <span>{row.areaDesc}</span>
          </div>
        ))
      )}
    </div>
  );
}
