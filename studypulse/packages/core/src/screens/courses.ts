// Display helpers for grades. The math itself is in @studypulse/core/grades.

/** 87.456 -> "87.5%", null -> "No grades yet". */
export function formatPercent(percent: number | null | undefined): string {
  if (percent === null || percent === undefined) return "No grades yet";
  return `${(Math.round(percent * 10) / 10).toString()}%`;
}

/** Status against the target, in words (never color alone). */
export function targetStatus(
  current: number | null,
  target: number | null,
): { tone: "error" | "ok"; text: string } | null {
  if (target === null || current === null) return null;
  return current < target
    ? { tone: "error", text: `Below your ${formatPercent(target)} target` }
    : { tone: "ok", text: `On track for ${formatPercent(target)}` };
}

export function formatScore(earned: number | string | null, possible: number | string | null) {
  if (earned === null) return possible === null ? "—" : `– / ${String(Number(possible))}`;
  const e = Number(earned);
  if (possible === null) return String(e);
  const p = Number(possible);
  return `${String(e)} / ${String(p)} (${formatPercent((e / p) * 100)})`;
}
