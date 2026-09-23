// Drop-lowest-N: removes the N graded items whose removal gives the highest category
// percentage. With points pooled in a category that isn't always the N lowest
// percentages (dropping a 40/100 can beat dropping a 5/10).
//
// Exact method (Kern & Bailey, "Optimal drop-lowest", 1997): a pooled percent q is
// achievable when keeping k items is possible with sum(earned - q * possible) >= 0, and
// the best k items for a given q are simply the k largest (earned - q * possible). So
// bisect on q. The SQL function private.best_kept_percent uses the same algorithm.

interface Scored {
  id: string;
  earned: number;
  possible: number;
}

const ITERATIONS = 60;

/** The k items to keep for a trial percent q (largest earned - q * possible). */
function keepFor(items: readonly Scored[], q: number, k: number): Scored[] {
  return [...items]
    .sort(
      (a, b) => b.earned - q * b.possible - (a.earned - q * a.possible) || a.id.localeCompare(b.id),
    )
    .slice(0, k);
}

/** Returns the ids to drop. Never drops every item. */
export function chooseDrops(items: readonly Scored[], dropLowest: number): string[] {
  const n = Math.min(Math.max(0, Math.floor(dropLowest)), items.length - 1);
  if (n <= 0) return [];
  const k = items.length - n;
  const ratio = (xs: readonly Scored[]) => {
    const p = xs.reduce((s, x) => s + x.possible, 0);
    return p > 0 ? xs.reduce((s, x) => s + x.earned, 0) / p : 0;
  };

  let lo = 0;
  let hi = Math.max(...items.map((x) => (x.possible > 0 ? x.earned / x.possible : 0)), 0);
  for (let i = 0; i < ITERATIONS; i++) {
    const q = (lo + hi) / 2;
    const kept = keepFor(items, q, k);
    if (kept.reduce((s, x) => s + x.earned - q * x.possible, 0) >= 0) lo = q;
    else hi = q;
  }
  // The set chosen at the best feasible q; re-check against the naive "lowest percent"
  // choice to guard against float ties.
  const candidate = keepFor(items, lo, k);
  const naive = [...items]
    .sort((a, b) => b.earned / b.possible - a.earned / a.possible)
    .slice(0, k);
  const kept = ratio(naive) > ratio(candidate) + 1e-12 ? naive : candidate;
  const keptIds = new Set(kept.map((x) => x.id));
  return items.filter((x) => !keptIds.has(x.id)).map((x) => x.id);
}
