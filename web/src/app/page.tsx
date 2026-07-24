"use client";

/* The demo/live links intentionally force a document navigation because the
 * dashboard reads the query string as an external-store snapshot. */

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { AdvisoryPlayback } from "@/components/AdvisoryPlayback";
import { IntensityPanel } from "@/components/IntensityPanel";
import { Rail } from "@/components/Rail";
import { cdtTime, formatCycle } from "@/lib/format";
import { DEFAULT_LAYER_STATE, DEMO_LAYER_STATE, toggleLayer, type WindThreshold } from "@/lib/layers";
import { allModelCodes } from "@/lib/mapStyle";
import { useDashboard } from "@/lib/useDashboard";

const StormMap = dynamic(() => import("@/components/StormMap"), {
  ssr: false,
  loading: () => (
    <div className="gw-map-loading" role="status">
      Loading map…
    </div>
  ),
});

export default function Home() {
  const dashboard = useDashboard();
  const [visibleModels, setVisibleModels] = useState<Set<string>>(new Set());
  // Start with the lightweight cone-first state while the URL mode resolves.
  // Live mode expands to DEFAULT_LAYER_STATE as soon as its manifest arrives.
  const [layers, setLayers] = useState(DEMO_LAYER_STATE);
  const [windThreshold, setWindThreshold] = useState<WindThreshold>(39);
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const initializedLayerModeRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (dashboard.status !== "ready" || initializedLayerModeRef.current === dashboard.demo) return;
    initializedLayerModeRef.current = dashboard.demo;
    setLayers(dashboard.demo ? DEMO_LAYER_STATE : DEFAULT_LAYER_STATE);
  }, [dashboard.demo, dashboard.status]);

  // Every model track present in the CURRENT storm's models.geojson,
  // defaulted to "all visible" (Round 2, v2 addendum: a data-driven default
  // replaces the old hardcoded 8-code whitelist, which can't work anymore
  // now that different storms/demos carry wildly different model rosters —
  // the historical Ida sample alone has ~80 track features). Re-seeded only
  // when the SELECTED storm/model-cycle actually changes, so toggling
  // individual checkboxes in the rail doesn't get stomped by this effect on
  // every unrelated re-render.
  const modelsKey = dashboard.storm ? `${dashboard.storm.id}:${dashboard.storm.modelCycle}` : "";
  const lastModelsKeyRef = useRef<string>("");
  const lastAvailableModelsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!dashboard.geo.models) return;
    if (lastModelsKeyRef.current === modelsKey) return;
    const nextAvailable = new Set(allModelCodes(dashboard.geo.models));
    const previousAvailable = lastAvailableModelsRef.current;
    const firstCycle = lastModelsKeyRef.current === "";
    lastModelsKeyRef.current = modelsKey;
    lastAvailableModelsRef.current = nextAvailable;
    setVisibleModels((previousVisible) => {
      const previouslyShowingAll =
        previousAvailable.size > 0 &&
        [...previousAvailable].every((model) => previousVisible.has(model));
      if (firstCycle || previouslyShowingAll) return nextAvailable;
      return new Set([...previousVisible].filter((model) => nextAvailable.has(model)));
    });
  }, [dashboard.geo.models, modelsKey]);

  const hasGraphs = dashboard.mode === "active" && !!dashboard.storm && !!dashboard.intensity;

  return (
    <div className="app-shell">
      {dashboard.stale && dashboard.manifest && (
        <div className="stale-banner">
          Data may be delayed — last updated {cdtTime(dashboard.manifest.generated)}
        </div>
      )}

      <div className="masthead">
        <div>
          <div className="title">
            {/* Dashboard mode is derived from the URL at document load. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className="brand-link" href="/" aria-label="Gulf Watch live dashboard">
              <em>Gulf Watch</em>
            </a>
            <span>Tropical weather for the Gulf Coast</span>
          </div>
          <div className="org">
            <Image src="/ah-datalytics-logo.png" alt="AH Datalytics" width={72} height={46} priority />
          </div>
        </div>
      </div>

      {dashboard.status === "ready" && dashboard.mode === "active" && dashboard.storm && (
        <div className="mobile-summary" aria-label="Current storm summary">
          <b>{dashboard.storm.name}</b>
          <span>{dashboard.storm.classification} · {dashboard.storm.intensityMph} mph</span>
          <span>Next advisory {cdtTime(dashboard.storm.nextAdvisoryTime)}</span>
        </div>
      )}

      <div className="main">
        <Rail
          status={dashboard.status}
          retry={dashboard.retry}
          dataIssues={dashboard.dataIssues}
          mode={dashboard.mode}
          storm={dashboard.storm}
          outlookText={dashboard.outlookText}
          probs={dashboard.probs}
          storms={dashboard.storms}
          demoParam={dashboard.demoParam}
          wwlines={dashboard.geo.wwlines}
          publicAdvisoryText={dashboard.textProducts?.publicAdvisory?.text}
        />
        <div className="mapcol">
          <StormMap
            geo={dashboard.geo}
            mode={dashboard.mode}
            visibleModels={visibleModels}
            onVisibleModelsChange={setVisibleModels}
            modelCycleLabel={dashboard.storm ? formatCycle(dashboard.storm.modelCycle) : undefined}
            layers={layers}
            onLayersToggle={(key) => {
              if (key === "graphs") setDiscussionOpen(false);
              setLayers((s) => toggleLayer(s, key));
            }}
            windThreshold={windThreshold}
            onWindThresholdChange={setWindThreshold}
            hasGraphs={hasGraphs}
            outlookText={dashboard.outlookText?.text}
            otherStorms={dashboard.otherStorms}
            discussion={dashboard.textProducts?.discussion ?? null}
            discussionOpen={discussionOpen}
            onDiscussionOpenChange={(open) => {
              if (open && layers.graphs) setLayers((state) => toggleLayer(state, "graphs"));
              setDiscussionOpen(open);
            }}
          />
          {dashboard.demo && <div className="simtag">{dashboard.demoTag}</div>}
          {hasGraphs && layers.graphs && dashboard.storm && dashboard.intensity && (
            <IntensityPanel
              intensity={dashboard.intensity}
              storm={dashboard.storm}
              track={dashboard.geo.track}
              visibleModels={visibleModels}
              onClose={() => setLayers((s) => toggleLayer(s, "graphs"))}
            />
          )}
          {dashboard.storm?.id === "al092021" && dashboard.advisories.length > 1 && (
            <AdvisoryPlayback
              advisories={dashboard.advisories}
              currentIndex={dashboard.advisoryIndex}
              onSelect={dashboard.selectAdvisoryIndex}
            />
          )}
        </div>
      </div>

      <div className="disclaimer">
        Not an official forecast. For decisions, consult the National Hurricane Center and NWS New
        Orleans/Baton Rouge.
      </div>
    </div>
  );
}
