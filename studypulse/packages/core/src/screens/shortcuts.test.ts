import { describe, expect, it } from "vitest";

import { describeKeys, matchShortcut, SHORTCUTS } from "./shortcuts.ts";

describe("keyboard shortcuts", () => {
  it("completes a two-key sequence", () => {
    const first = matchShortcut([], "g");
    expect(first).toEqual({ match: null, pending: ["g"] });
    const second = matchShortcut(first.pending, "t");
    expect(second.match?.action).toEqual({ href: "/today" });
    expect(second.pending).toEqual([]);
  });

  it("matches single keys right away", () => {
    expect(matchShortcut([], "f").match?.label).toBe("Start a focus session");
    expect(matchShortcut([], "?").match?.action).toEqual({ help: true });
  });

  it("starts over when a key doesn't continue the sequence", () => {
    // "g" then "f" is Focus; "g" then "x" drops the "g".
    expect(matchShortcut(["g"], "x")).toEqual({ match: null, pending: [] });
    // "g" then "u" isn't a sequence, but "u" alone is.
    expect(matchShortcut(["g"], "u").match?.action).toEqual({ href: "/courses/upload" });
  });

  it("has no two shortcuts with the same keys, and none that shadow a sequence", () => {
    const keys = SHORTCUTS.map((s) => s.keys.join(" "));
    expect(new Set(keys).size).toBe(keys.length);
    const singles = SHORTCUTS.filter((s) => s.keys.length === 1).map((s) => s.keys[0]);
    const firsts = SHORTCUTS.filter((s) => s.keys.length > 1).map((s) => s.keys[0]);
    expect(singles.filter((k) => firsts.includes(k))).toEqual([]);
  });

  it("describes keys in words", () => {
    expect(describeKeys(["g", "t"])).toBe("g then t");
  });
});
