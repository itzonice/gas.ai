// Match: pair each term with its definition. Tiles are picked one at a time (tap, click,
// or keyboard), never dragged (WCAG 2.5.7). The clock only counts up; it's a score, not a
// limit, and the screen can hide it (WCAG 2.2.1). Pure; pass a seeded Rng in tests.
import type { StudyCard } from "./questions.ts";
import { shuffle, type Rng } from "./rng.ts";

export interface MatchTile {
  id: string;
  cardId: string;
  side: "front" | "back";
  text: string;
}

export interface MatchState {
  tiles: readonly MatchTile[];
  /** Ids of tiles already paired. */
  matched: readonly string[];
  /** The tile picked first, waiting for its partner. */
  selected: string | null;
  mistakes: number;
  /** The last wrong pair, for "not a match" feedback until the next pick. */
  lastMismatch: readonly [string, string] | null;
}

export type MatchEvent = "selected" | "deselected" | "match" | "mismatch" | "ignored";

export const DEFAULT_MATCH_PAIRS = 6;
/** Longer text doesn't fit a tile; such cards are left out of Match. */
export const MAX_TILE_CHARS = 160;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Picks up to `pairs` cards with distinct fronts and backs and lays their tiles out shuffled. */
export function createMatch(
  cards: readonly StudyCard[],
  rng: Rng = Math.random,
  pairs = DEFAULT_MATCH_PAIRS,
): MatchState {
  const picked: StudyCard[] = [];
  for (const card of shuffle(cards, rng)) {
    if (!card.front.trim() || !card.back.trim()) continue;
    if (card.front.length > MAX_TILE_CHARS || card.back.length > MAX_TILE_CHARS) continue;
    // Two tiles with the same text would be indistinguishable.
    if (picked.some((p) => same(p.front, card.front) || same(p.back, card.back))) continue;
    if (same(card.front, card.back)) continue;
    picked.push(card);
    if (picked.length >= pairs) break;
  }
  const tiles = shuffle(
    picked.flatMap((c): MatchTile[] => [
      { id: `${c.id}:front`, cardId: c.id, side: "front", text: c.front.trim() },
      { id: `${c.id}:back`, cardId: c.id, side: "back", text: c.back.trim() },
    ]),
    rng,
  );
  return { tiles, matched: [], selected: null, mistakes: 0, lastMismatch: null };
}

export const matchDone = (state: MatchState) =>
  state.tiles.length > 0 && state.matched.length === state.tiles.length;

/** Picks a tile. Picking the selected tile again puts it back. */
export function selectTile(
  state: MatchState,
  tileId: string,
): { state: MatchState; event: MatchEvent } {
  const tile = state.tiles.find((t) => t.id === tileId);
  if (!tile || state.matched.includes(tileId)) return { state, event: "ignored" };
  if (state.selected === null) {
    return { state: { ...state, selected: tileId, lastMismatch: null }, event: "selected" };
  }
  if (state.selected === tileId) {
    return { state: { ...state, selected: null, lastMismatch: null }, event: "deselected" };
  }
  const first = state.tiles.find((t) => t.id === state.selected);
  if (!first) return { state: { ...state, selected: null }, event: "ignored" };
  if (first.cardId === tile.cardId) {
    return {
      state: {
        ...state,
        matched: [...state.matched, first.id, tile.id],
        selected: null,
        lastMismatch: null,
      },
      event: "match",
    };
  }
  return {
    state: {
      ...state,
      selected: null,
      mistakes: state.mistakes + 1,
      lastMismatch: [first.id, tile.id],
    },
    event: "mismatch",
  };
}

/** "0:42" from milliseconds. */
export function formatMatchTime(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`;
}

/** What a screen reader hears for a tile: its text and whether it's picked or done. */
export function tileLabel(tile: MatchTile, state: MatchState): string {
  if (state.matched.includes(tile.id)) return `${tile.text}, matched`;
  if (state.selected === tile.id) return `${tile.text}, selected`;
  return tile.text;
}
