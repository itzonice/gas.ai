import { readFileSync } from "node:fs";

import { expect, it } from "vitest";

import { renderGradeParitySql } from "./parity.ts";

it("the generated SQL grade parity test is current (run `pnpm grades:parity`)", () => {
  const onDisk = readFileSync(
    new URL("../../../../supabase/tests/database/190_grade_parity.test.sql", import.meta.url),
    "utf8",
  );
  expect(onDisk).toBe(renderGradeParitySql());
});
