import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StudyPulse",
  description: "Turn your syllabus into a plan.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
