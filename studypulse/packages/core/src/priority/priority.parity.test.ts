import { readFileSync } from "node:fs";

import { expect, it } from "vitest";

import { renderPriorityParitySql } from "./parity.ts";

it("the generated SQL parity test matches the current TS formula (run `pnpm priority:parity`)", () => {
  const onDisk = readFileSync(
    new URL("../../../../supabase/tests/database/130_priority_parity.test.sql", import.meta.url),
    "utf8",
  );
  expect(onDisk).toBe(renderPriorityParitySql());
});
