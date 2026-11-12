import { notFound } from "next/navigation";

import { Gallery } from "./Gallery";

// Development-only gallery of the shared components, for visual and keyboard review.
export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Gallery />;
}
