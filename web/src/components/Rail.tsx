"use client";

import type { Mode, ProbsEntry, StormEntry } from "@/lib/types";
import { Alerts } from "./Alerts";
import { CoastalAlertsLegend } from "./CoastalAlertsLegend";
import { OutlookPanel } from "./OutlookPanel";
import { StormHeader } from "./StormHeader";
import { WindProbabilities } from "./WindProbabilities";

export interface RailProps {
  status: "loading" | "ready" | "unavailable";
  retry: () => void;
  dataIssues: { product: string; message: string }[];
  mode: Mode;
  storm: StormEntry | null;
  outlookText: { issued: string; text: string } | null;
  /** models.geojson for the selected storm — forwarded to ModelLegend so it
   *  can decide whether to render the "AI Guidance" group (N9). */
  /** storms/{id}/probs.json for the selected storm — see WindProbabilities. */
  probs: ProbsEntry[] | null;
  storms: StormEntry[];
  demoParam: string | null;
  wwlines?: GeoJSON.FeatureCollection | null;
  publicAdvisoryText?: string | null;
}

/**
 * Left rail. Active mode order (per the v2 addendum): storm header, wind
 * chances at New Orleans, watches/warnings, forecast models, collapsible
 * forecast discussion. Quiet mode: "no active systems" + seven-day outlook +
 * watches/warnings. The intensity panel lives under the map, not here.
 */
export function Rail({
  status,
  retry,
  dataIssues,
  mode,
  storm,
  outlookText,
  probs,
  storms,
  demoParam,
  wwlines,
  publicAdvisoryText,
}: RailProps) {
  return (
    <div className="rail">
      {status !== "ready" ? (
        <div className="data-state" role={status === "unavailable" ? "alert" : "status"}>
          <div className="data-state-title">
            {status === "loading" ? "Loading live conditions…" : "Live conditions unavailable"}
          </div>
          <p>
            {status === "loading"
              ? "Checking the latest National Hurricane Center products."
              : "We could not load the live storm feed. Do not interpret this as an all-clear."}
          </p>
          {status === "unavailable" && (
            <button type="button" className="retry-button" onClick={retry}>Try again</button>
          )}
        </div>
      ) : mode === "active" && storm ? (
        <>
          {storms.length > 1 && (
            <div className="storm-picker">
              <div className="kicker">Active storms</div>
              <nav aria-label="Choose a storm">
                {storms.map((option) => {
                  const params = new URLSearchParams();
                  if (demoParam) params.set("demo", demoParam);
                  params.set("storm", option.id);
                  return (
                    <a
                      key={option.id}
                      href={`/?${params.toString()}`}
                      aria-current={option.id === storm.id ? "page" : undefined}
                      title={`View ${option.name}`}
                    >
                      <b>{option.name}</b>
                      <span>{option.intensityMph} mph{option.inGulfBox ? " · Gulf" : ""}</span>
                    </a>
                  );
                })}
              </nav>
            </div>
          )}
          <StormHeader storm={storm} />
          <CoastalAlertsLegend
            warnings={wwlines}
            publicAdvisoryText={publicAdvisoryText}
          />
          <WindProbabilities probs={probs} />
        </>
      ) : (
        <>
          <OutlookPanel outlookText={outlookText} />
          <Alerts mode={mode} />
          <div className="rail-demo-action">
            <div className="demo-callout">
              <div>
                <div className="demo-callout-title">Explore a historical storm</div>
                <div className="demo-callout-copy">See Hurricane Ida’s August 2021 forecast dashboard.</div>
              </div>
              {/* Full navigation updates the URL-backed dashboard data source. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a className="demo-link" href="/?demo=ida">
                View Ida demo <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
        </>
      )}
      {status === "ready" && dataIssues.length > 0 && (
        <details className="data-issues">
          <summary>Some products are temporarily unavailable</summary>
          <ul>
            {dataIssues.map((issue, index) => (
              <li key={`${issue.product}-${index}`}><b>{issue.product}:</b> {issue.message}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="foot">Sources: National Hurricane Center · NWS New Orleans/Baton Rouge</div>
    </div>
  );
}
