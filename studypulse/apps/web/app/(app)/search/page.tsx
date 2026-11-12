import type { Metadata } from "next";
import { Suspense } from "react";

import { SearchScreen } from "@/components/search/SearchScreen";

export const metadata: Metadata = { title: "Search" };

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchScreen />
    </Suspense>
  );
}
