import { describe, expect, it } from "vitest";

import type { ReviewDraft } from "./review.ts";
import {
  draftChanged,
  parseSavedDraft,
  SAVED_DRAFT_MAX_AGE_MS,
  savedDraftKey,
  serializeDraft,
} from "./saved-draft.ts";

const draft: ReviewDraft = {
  course: {
    name: "Biology",
    code: "BIO 201",
    instructor: "",
    term_start: "2027-01-11",
    term_end: "",
  },
  categories: [{ key: "0", name: "Homework", weight: 40, drop_lowest: 1 }],
  items: [
    {
      key: "0",
      title: "Quiz week 5",
      kind: "quiz",
      category_name: "Homework",
      due_date: "2027-02-12",
      due_time: null,
      points_possible: 10,
      confidence: "low",
      reasons: ["Date worked out from a week number or class day"],
      source_quote: "Quiz in week 5",
      checked: false,
      excluded: false,
    },
  ],
  letter_scale: null,
  meetings: [
    { weekday: "tue", start_time: "10:00", end_time: "10:50", kind: "lecture", location: null },
  ],
  timezone: "America/Chicago",
};
const upload = "11111111-1111-4111-8111-111111111111";
const now = Date.parse("2027-01-15T12:00:00Z");

describe("saved review drafts", () => {
  it("round-trips a draft for the same upload", () => {
    const edited = { ...draft, items: [{ ...draft.items[0]!, checked: true, title: "Quiz 5" }] };
    expect(parseSavedDraft(serializeDraft(upload, edited, now), upload, now)).toEqual(edited);
    expect(savedDraftKey(upload)).toBe(`studypulse.review-draft.${upload}`);
  });

  it("ignores a draft saved for another upload", () => {
    const other = "22222222-2222-4222-8222-222222222222";
    expect(parseSavedDraft(serializeDraft(other, draft, now), upload, now)).toBeNull();
  });

  it("drops drafts older than two weeks", () => {
    const raw = serializeDraft(upload, draft, now);
    expect(parseSavedDraft(raw, upload, now + SAVED_DRAFT_MAX_AGE_MS - 1)).not.toBeNull();
    expect(parseSavedDraft(raw, upload, now + SAVED_DRAFT_MAX_AGE_MS + 1)).toBeNull();
  });

  it("treats storage as untrusted: bad JSON or wrong shapes are ignored", () => {
    expect(parseSavedDraft(null, upload, now)).toBeNull();
    expect(parseSavedDraft("{not json", upload, now)).toBeNull();
    const tampered = JSON.parse(serializeDraft(upload, draft, now)) as {
      draft: { items: { kind: string }[] };
    };
    tampered.draft.items[0]!.kind = "<script>";
    expect(parseSavedDraft(JSON.stringify(tampered), upload, now)).toBeNull();
  });

  it("notices when anything changed", () => {
    expect(draftChanged(draft, structuredClone(draft))).toBe(false);
    expect(draftChanged(draft, { ...draft, course: { ...draft.course, code: "BIO 202" } })).toBe(
      true,
    );
  });
});
