// Parser eval: runs every case in evals/syllabi through the real parser and scores
// date, time, category, and weight accuracy against the expected answers.
//
//   pnpm --filter @studypulse/core eval                  # all cases (needs ANTHROPIC_API_KEY)
//   pnpm --filter @studypulse/core eval --case tricky    # ids containing "tricky"
//   pnpm --filter @studypulse/core eval --model claude-opus-5 --prompt syllabus-v1
//   pnpm --filter @studypulse/core eval --self-check     # score expected vs expected (no API)
//   pnpm --filter @studypulse/core eval --min-date-accuracy 0.9   # exit 1 below threshold
//
// Every run costs real API money (roughly one parse per case). Results are written
// to evals/results/ (git-ignored).
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import Anthropic from "@anthropic-ai/sdk";

import {
  loadCases,
  scoreCase,
  summarize,
  expectedAsResult,
  type CaseScore,
  type LoadedCase,
} from "../src/evals/index.ts";
import {
  joinPages,
  parseSyllabus,
  postProcess,
  PROMPTS,
  CURRENT_PROMPT,
  type PromptVersion,
} from "../src/parser/index.ts";

const { values } = parseArgs({
  options: {
    case: { type: "string" },
    model: { type: "string" },
    prompt: { type: "string" },
    concurrency: { type: "string", default: "3" },
    "self-check": { type: "boolean", default: false },
    "min-date-accuracy": { type: "string" },
  },
});

const promptVersion = (values.prompt ?? CURRENT_PROMPT.version) as PromptVersion;
if (!(promptVersion in PROMPTS)) throw new Error(`Unknown prompt version ${promptVersion}`);

const cases = loadCases(new URL("../evals/syllabi/", import.meta.url), values.case);
if (cases.length === 0) throw new Error("No eval cases matched");

const client = values["self-check"] ? null : new Anthropic();
const pct = (x: number | null) => (x === null ? "  -  " : `${(x * 100).toFixed(1).padStart(5)}%`);

interface CaseRun {
  id: string;
  score?: CaseScore;
  error?: string;
  usage?: { input: number; output: number };
}

async function run(c: LoadedCase): Promise<CaseRun> {
  if (!client) return { id: c.id, score: scoreCase(c, expectedAsResult(c)) };
  try {
    const parsed = await parseSyllabus(
      client,
      joinPages([c.syllabus]),
      {
        timezone: c.input.timezone,
        today: c.input.today,
        termStart: c.input.term_start,
        termEnd: c.input.term_end,
      },
      { promptVersion, ...(values.model ? { model: values.model } : {}) },
    );
    const result = postProcess(parsed.output, {
      timezone: c.input.timezone,
      promptVersion: parsed.promptVersion,
      model: parsed.usage[0]?.model ?? "unknown",
      termStartHint: c.input.term_start,
      termEndHint: c.input.term_end,
    });
    return {
      id: c.id,
      score: scoreCase(c, result),
      usage: {
        input: parsed.usage.reduce((s, u) => s + u.inputTokens, 0),
        output: parsed.usage.reduce((s, u) => s + u.outputTokens, 0),
      },
    };
  } catch (error) {
    return { id: c.id, error: error instanceof Error ? error.message : String(error) };
  }
}

const runs: CaseRun[] = [];
const queue = [...cases];
await Promise.all(
  Array.from({ length: Number(values.concurrency) }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      const r = await run(c);
      runs.push(r);
      process.stdout.write(r.error ? `x ${r.id}: ${r.error}\n` : `. ${r.id}\n`);
    }
  }),
);
runs.sort((a, b) => a.id.localeCompare(b.id));

console.log("\ncase                  recall  precis  dates   times   categ   weights total");
for (const r of runs) {
  if (!r.score) {
    console.log(`${r.id.padEnd(20)}  ERROR ${r.error ?? ""}`);
    continue;
  }
  const s = r.score;
  console.log(
    `${r.id.padEnd(20)} ${pct(s.recall)} ${pct(s.precision)} ${pct(s.dateAccuracy)} ${pct(s.timeAccuracy)} ${pct(s.categoryAccuracy)} ${pct(s.weightAccuracy)} ${s.weightTotalOk ? "ok" : `off (${String(s.weightTotal)})`}`,
  );
}
const scores = runs.flatMap((r) => (r.score ? [r.score] : []));
const summary = summarize(scores);
const failed = runs.filter((r) => r.error).length;
console.log(
  `\nOVERALL (${String(summary.cases)} scored, ${String(failed)} errored): recall ${pct(summary.recall)}, precision ${pct(summary.precision)}, dates ${pct(summary.dateAccuracy)}, times ${pct(summary.timeAccuracy)}, categories ${pct(summary.categoryAccuracy)}, weights ${pct(summary.weightAccuracy)}, weight totals ok ${pct(summary.weightTotalOkRate)}`,
);

const worst = runs
  .flatMap((r) => (r.score?.mismatches ?? []).map((m) => `${r.id}: ${m}`))
  .slice(0, 40);
if (worst.length) console.log(`\nFirst mismatches:\n  ${worst.join("\n  ")}`);

const resultsDir = new URL("../evals/results/", import.meta.url);
mkdirSync(resultsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = new URL(
  `${stamp}-${values["self-check"] ? "self-check" : `${promptVersion}-${values.model ?? "default"}`}.json`,
  resultsDir,
);
writeFileSync(
  file,
  `${JSON.stringify({ promptVersion, model: values.model ?? null, summary, runs }, null, 2)}\n`,
);
console.log(`\nWrote ${file.pathname}`);

const min = values["min-date-accuracy"] ? Number(values["min-date-accuracy"]) : null;
if (failed > 0 || (min !== null && summary.dateAccuracy < min)) process.exitCode = 1;
