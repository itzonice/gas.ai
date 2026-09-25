import { darkColors, lightColors } from "@studypulse/tokens";
import type { Metadata, Viewport } from "next";

import "@studypulse/tokens/tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "StudyPulse", template: "%s · StudyPulse" },
  description: "Turn your syllabus into a plan.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Never block zoom: layouts must hold up at 200% text size.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: lightColors.surfaceContainer },
    { media: "(prefers-color-scheme: dark)", color: darkColors.surfaceContainer },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
