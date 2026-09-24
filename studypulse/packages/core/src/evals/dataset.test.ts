import { describe, expect, it } from "vitest";

import { loadCases } from "./load.ts";
import { scoreCase } from "./score.ts";
import { expectedAsResult } from "./self-check.ts";

// Dataset integrity checks that run in CI without calling the API.
describe("parser eval dataset", () => {
  const cases = loadCases(new URL("../../evals/syllabi/", import.meta.url));

  it("has 20 standard and 10 tricky cases", () => {
    expect(cases.filter((c) => c.id.startsWith("std-"))).toHaveLength(20);
    expect(cases.filter((c) => c.id.startsWith("tricky-"))).toHaveLength(10);
  });

  it.each(cases.map((c) => [c.id, c] as const))("%s is well-formed", (_id, c) => {
    expect(c.syllabus.length).toBeGreaterThan(200);
    const total = c.expected.categories.reduce((s, x) => s + x.weight, 0);
    expect(Math.abs(total - 100)).toBeLessThanOrEqual(1);
    const names = new Set(c.expected.categories.map((x) => x.name));
    for (const a of c.expected.assignments) {
      if (a.category) expect(names).toContain(a.category);
      if (a.due_date) expect(a.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(scoreCase(c, expectedAsResult(c)).mismatches).toEqual([]);
  });
});
