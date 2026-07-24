import type { Metadata } from "next";
import "./globals.css";
import { ModeGate } from "./ModeGate";
import { DashboardProvider } from "@/lib/useDashboard";

export const metadata: Metadata = {
  title: "The Gulf Watch — New Orleans Tropical Weather",
  description:
    "A New Orleans tropical weather desk from AH Datalytics: live storm tracking, watches and warnings for the metro parishes, tide gauges, and a seven-day genesis outlook. Not an official forecast — for decisions, consult the National Hurricane Center and NWS New Orleans/Baton Rouge.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <DashboardProvider>
          <ModeGate>{children}</ModeGate>
        </DashboardProvider>
      </body>
    </html>
  );
}
