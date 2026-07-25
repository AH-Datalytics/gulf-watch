import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { ModeGate } from "./ModeGate";
import { DashboardProvider } from "@/lib/useDashboard";

export const metadata: Metadata = {
  title: "The Gulf Watch — New Orleans Tropical Weather",
  description:
    "A New Orleans tropical weather desk from AH Datalytics: live storm tracking, watches and warnings for the metro parishes, tide gauges, and a seven-day genesis outlook. Not an official forecast — for decisions, consult the National Hurricane Center and NWS New Orleans/Baton Rouge.",
};

const blobBase = (process.env.NEXT_PUBLIC_BLOB_BASE_URL ?? "").replace(/\/$/, "");
const earlyManifestScript = `(() => {
  const demo = new URLSearchParams(window.location.search).get("demo");
  const demoUrl = demo === "quiet"
    ? "/demo/manifest-quiet.json"
    : demo === "bertha"
      ? "/demo/bertha/manifest.json"
      : "/demo/ida/manifest.json";
  const url = demo === null ? ${JSON.stringify(`${blobBase}/manifest.json`)} : demoUrl;
  const requestUrl = demo === null ? url + "?v=" + Math.floor(Date.now() / 300000) : url;
  window.__GULF_WATCH_MANIFEST_PREFETCH__ = {
    url,
    promise: fetch(requestUrl, { cache: "force-cache" }).then((response) => {
      if (!response.ok) throw new Error("Manifest prefetch failed: " + response.status);
      return response.json();
    }),
  };
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {blobBase && <link rel="preconnect" href={blobBase} crossOrigin="anonymous" />}
        <link rel="preconnect" href="https://server.arcgisonline.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://api.weather.gov" crossOrigin="anonymous" />
      </head>
      <body>
        <DashboardProvider>
          <ModeGate>{children}</ModeGate>
        </DashboardProvider>
        <Script
          id="gulf-watch-manifest-prefetch"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: earlyManifestScript }}
        />
      </body>
    </html>
  );
}
