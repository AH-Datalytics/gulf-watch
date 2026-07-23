"use client";

import { useEffect } from "react";
import { useDashboard } from "@/lib/useDashboard";

/**
 * Applies data-mode="quiet"|"active" to <html> based on the live dashboard
 * mode, so globals.css's [data-mode="..."] token blocks take effect. Runs as
 * a client component per the root layout per the brief ("root layout sets
 * data-mode from useDashboard().mode").
 */
export function ModeGate({ children }: { children: React.ReactNode }) {
  const { mode } = useDashboard();

  useEffect(() => {
    document.documentElement.setAttribute("data-mode", mode);
  }, [mode]);

  return <>{children}</>;
}
