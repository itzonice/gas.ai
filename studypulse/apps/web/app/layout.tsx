import { darkColors, lightColors } from "@studypulse/tokens";
import type { Metadata, Viewport } from "next";

import { SessionProvider } from "@/components/auth/SessionProvider";
import { ConsentManager } from "@/components/privacy/ConsentManager";
import { themeBootScript } from "@/lib/theme-boot";

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
    // data-theme is set before hydration by the boot script, so React may see it differ.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <SessionProvider>
          {children}
          <ConsentManager />
        </SessionProvider>
      </body>
    </html>
  );
}
