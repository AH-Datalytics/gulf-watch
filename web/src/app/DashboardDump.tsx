"use client";

import { useDashboard } from "@/lib/useDashboard";

/**
 * Task 7 placeholder view: no real UI yet, just a raw dump of what
 * useDashboard() returns so the data layer can be verified end-to-end
 * (live Blob fetch, ?demo=1, ?demo=quiet) before Tasks 8-12 build the
 * actual rail/map/intensity-panel components on top of it.
 */
export default function DashboardDump() {
  const dashboard = useDashboard();

  return (
    <main style={{ padding: "24px 32px" }}>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 20 }}>
        The <em style={{ color: "var(--accent)" }}>Gulf Watch</em> — data
        layer dump (Task 7)
      </h1>
      <p style={{ color: "var(--ink-dim)", fontSize: 13, marginTop: 6 }}>
        mode=<b className="num">{dashboard.mode}</b> · demo=
        <b className="num">{String(dashboard.demo)}</b> · stale=
        <b className="num">{String(dashboard.stale)}</b>
      </p>
      <p style={{ color: "var(--ink-dim)", fontSize: 11, marginTop: 12 }}>
        Not an official forecast. For decisions, consult the National
        Hurricane Center and NWS New Orleans/Baton Rouge.
      </p>
      <pre
        style={{
          marginTop: 16,
          padding: 16,
          background: "var(--panel)",
          border: "1px solid var(--rule)",
          color: "var(--ink)",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          overflowX: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {JSON.stringify(dashboard, null, 2)}
      </pre>
    </main>
  );
}
