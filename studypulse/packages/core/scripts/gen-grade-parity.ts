// Writes the pgTAP parity test for public.course_current_grade from the TS fixtures.
// Run: pnpm --filter @studypulse/core grades:parity
import { writeFileSync } from "node:fs";

import { renderGradeParitySql } from "../src/grades/parity.ts";

const target = new URL(
  "../../../supabase/tests/database/190_grade_parity.test.sql",
  import.meta.url,
);
writeFileSync(target, renderGradeParitySql());
console.log(`wrote ${target.pathname}`);
