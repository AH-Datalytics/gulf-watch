import type { Metadata } from "next";
import "./globals.css";
import { ModeGate } from "./ModeGate";

export const metadata: Metadata = {
  title: "The Gulf Watch — a New Orleans tropical weather desk",
  description:
    "AH Datalytics tropical outlook desk for New Orleans. Not an official forecast — for decisions, consult the National Hurricane Center and NWS New Orleans/Baton Rouge.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ModeGate>{children}</ModeGate>
      </body>
    </html>
  );
}
