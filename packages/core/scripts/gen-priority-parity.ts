// Writes the pgTAP parity test for public.task_priority from the TS fixtures.
// Run: pnpm --filter @studypulse/core priority:parity
import { writeFileSync } from "node:fs";

import { renderPriorityParitySql } from "../src/priority/parity.ts";

const target = new URL(
  "../../../supabase/tests/database/130_priority_parity.test.sql",
  import.meta.url,
);
writeFileSync(target, renderPriorityParitySql());
console.log(`wrote ${target.pathname}`);
