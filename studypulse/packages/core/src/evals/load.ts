import { readdirSync, readFileSync } from "node:fs";

import { evalCaseSchema, type EvalCase } from "./case.ts";

export interface LoadedCase extends EvalCase {
  id: string;
  syllabus: string;
}

/** Loads every evals/syllabi/<id>/{case.json,syllabus.txt}, optionally filtered by id substring. */
export function loadCases(root: URL, filter?: string): LoadedCase[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && (!filter || d.name.includes(filter)))
    .map((d) => d.name)
    .sort()
    .map((id) => {
      const dir = new URL(`${id}/`, root);
      const parsed = evalCaseSchema.parse(
        JSON.parse(readFileSync(new URL("case.json", dir), "utf8")),
      );
      return { ...parsed, id, syllabus: readFileSync(new URL("syllabus.txt", dir), "utf8") };
    });
}
