import { describe, expect, it } from "vitest";

import { destinations, hidesFocusButton, isActive, secondaryDestinations } from "./nav-items";

describe("navigation", () => {
  it("keeps five main destinations, with Study among them, and Stats and Settings below", () => {
    expect(destinations.map((d) => d.label)).toEqual([
      "Today",
      "Calendar",
      "Courses",
      "Study",
      "Focus",
    ]);
    expect(secondaryDestinations.map((d) => d.label)).toEqual(["Stats", "Settings"]);
  });

  it("marks Study active on every study page", () => {
    for (const path of ["/study", "/study/sets/abc", "/study/sets/abc/learn", "/study/notes/n1"]) {
      expect(isActive(path, "/study")).toBe(true);
    }
    expect(isActive("/studying", "/study")).toBe(false);
  });
});

describe("the floating Start focus button", () => {
  it("stays out of the way of the timer, study sessions, and the note editor", () => {
    for (const path of [
      "/focus",
      "/study/review",
      "/study/sets/abc/flashcards",
      "/study/sets/abc/match",
      "/study/notes/n1",
    ]) {
      expect(hidesFocusButton(path), path).toBe(true);
    }
  });

  it("shows on the other screens, including the study hub and a set's own page", () => {
    for (const path of ["/today", "/study", "/study/sets/abc", "/courses/abc", "/settings"]) {
      expect(hidesFocusButton(path), path).toBe(false);
    }
  });
});
