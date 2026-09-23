// Drop-lowest-N: removes the N graded items whose removal gives the highest category
// percentage. With points pooled in a category that isn't always the N lowest
// percentages (dropping a 40/100 can beat dropping a 5/10), so small cases are solved
// exactly and large ones greedily.

interface Scored {
  id: string;
  earned: number;
  possible: number;
}

/** Above this many subsets to check, fall back to the greedy choice. */
const MAX_EXACT_COMBINATIONS = 20_000;

function combinationsCount(n: number, k: number): number {
  let c = 1;
  for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
  return c;
}

function percentWithout(items: readonly Scored[], dropped: ReadonlySet<number>): number {
  let earned = 0;
  let possible = 0;
  items.forEach((it, i) => {
    if (!dropped.has(i)) {
      earned += it.earned;
      possible += it.possible;
    }
  });
  return possible > 0 ? earned / possible : 0;
}

/** Returns the ids to drop. Never drops every item. */
export function chooseDrops(items: readonly Scored[], dropLowest: number): string[] {
  const n = Math.min(Math.max(0, Math.floor(dropLowest)), items.length - 1);
  if (n <= 0) return [];

  if (combinationsCount(items.length, n) <= MAX_EXACT_COMBINATIONS) {
    let best: number[] = [];
    let bestPercent = -Infinity;
    const pick: number[] = [];
    const visit = (start: number) => {
      if (pick.length === n) {
        const p = percentWithout(items, new Set(pick));
        if (p > bestPercent + 1e-12) {
          bestPercent = p;
          best = [...pick];
        }
        return;
      }
      for (let i = start; i <= items.length - (n - pick.length); i++) {
        pick.push(i);
        visit(i + 1);
        pick.pop();
      }
    };
    visit(0);
    return best.map((i) => items[i]?.id ?? "");
  }

  // Greedy: repeatedly drop the single item whose removal helps most.
  const dropped = new Set<number>();
  for (let k = 0; k < n; k++) {
    let bestIndex = -1;
    let bestPercent = -Infinity;
    for (let i = 0; i < items.length; i++) {
      if (dropped.has(i)) continue;
      dropped.add(i);
      const p = percentWithout(items, dropped);
      dropped.delete(i);
      if (p > bestPercent) {
        bestPercent = p;
        bestIndex = i;
      }
    }
    dropped.add(bestIndex);
  }
  return [...dropped].map((i) => items[i]?.id ?? "");
}
