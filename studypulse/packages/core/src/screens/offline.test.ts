// The "airplane mode" test (launch audit L2): writes made offline are kept, survive a
// restart (serialize and parse), and reach the server in order once it's back.
import { describe, expect, it } from "vitest";

import type { ApiClient } from "../api/client.ts";
import { todayOverviewSchema, type CourseDetail } from "../api/schemas.ts";
import {
  CACHE_MAX_AGE_MS,
  enqueue,
  flushOutbox,
  offlineMessage,
  parseCache,
  parseOutbox,
  serializeCache,
  type OutboxEntry,
  type OutboxOp,
} from "./offline.ts";

const S = "00000000-0000-4000-8000-00000000000a";
const C = "00000000-0000-4000-8000-00000000000c";
const A = "00000000-0000-4000-8000-0000000000a1";
const offlineError = Object.assign(new Error("offline"), { network: true });
const isNetwork = (e: unknown) => (e as { network?: boolean }).network === true;

describe("outbox", () => {
  it("survives airplane mode: queued offline, kept across a restart, sent in order after", async () => {
    let list: OutboxEntry[] = [];
    list = enqueue(list, {
      kind: "session.start",
      id: S,
      courseId: C,
      assignmentId: A,
      startedAt: "2027-03-01T15:00:00Z",
    });
    list = enqueue(list, { kind: "session.stop", id: S, endedAt: "2027-03-01T15:25:00Z" });
    list = enqueue(list, { kind: "assignment.status", id: A, status: "done" });

    // Still offline: nothing is lost, nothing is sent out of order.
    const tried: string[] = [];
    const offline = await flushOutbox(
      list,
      (op) => {
        tried.push(op.kind);
        return Promise.reject(offlineError);
      },
      isNetwork,
    );
    expect(offline.remaining).toHaveLength(3);
    expect(tried).toEqual(["session.start"]);

    // The app restarts: the saved outbox comes back intact.
    const restored = parseOutbox(JSON.stringify(offline.remaining));
    expect(restored).toEqual(list);

    // Back online: everything goes, in the order it happened.
    const sent: OutboxOp[] = [];
    const online = await flushOutbox(
      restored,
      (op) => {
        sent.push(op);
        return Promise.resolve();
      },
      isNetwork,
    );
    expect(online).toMatchObject({ remaining: [], sent: 3, refused: [] });
    expect(sent.map((o) => o.kind)).toEqual(["session.start", "session.stop", "assignment.status"]);
  });

  it("keeps only the last status or score edit of an assignment", () => {
    let list: OutboxEntry[] = [];
    list = enqueue(list, { kind: "assignment.status", id: A, status: "done" });
    list = enqueue(list, { kind: "assignment.status", id: A, status: "todo" });
    list = enqueue(list, { kind: "assignment.score", id: A, pointsEarned: 7, pointsPossible: 10 });
    list = enqueue(list, { kind: "assignment.score", id: A, pointsEarned: 8, pointsPossible: 10 });
    expect(list.map((e) => e.op)).toEqual([
      { kind: "assignment.status", id: A, status: "todo" },
      { kind: "assignment.score", id: A, pointsEarned: 8, pointsPossible: 10 },
    ]);
  });

  it("drops a write the server refuses instead of blocking the rest", async () => {
    const list = enqueue(enqueue([], { kind: "assignment.status", id: A, status: "done" }), {
      kind: "block.status",
      id: S,
      status: "done",
    });
    const result = await flushOutbox(
      list,
      (op) =>
        op.kind === "assignment.status"
          ? Promise.reject(new Error("forbidden"))
          : Promise.resolve(),
      isNetwork,
    );
    expect(result.sent).toBe(1);
    expect(result.refused).toHaveLength(1);
    expect(result.remaining).toEqual([]);
  });

  it("treats saved writes as untrusted", () => {
    expect(parseOutbox("not json")).toEqual([]);
    expect(
      parseOutbox(
        JSON.stringify([
          { op: { kind: "assignment.status", id: A, status: "done" }, queuedAt: 1 },
          { op: { kind: "drop.table", id: A }, queuedAt: 2 },
          { op: { kind: "assignment.status", id: "not-a-uuid", status: "done" }, queuedAt: 3 },
        ]),
      ),
    ).toHaveLength(1);
  });
});

describe("saved screen data", () => {
  const overview = {
    timezone: "America/Chicago",
    today: "2027-03-01",
    week_start: "2027-03-01",
    due_this_week: 2,
    focus_minutes_this_week: 95,
    courses_at_risk: [],
    reviews: [],
    next_exam: null,
    courses: [],
  };
  const now = Date.parse("2027-03-01T20:00:00Z");

  it("reads back what was saved, if it still fits the schema and isn't stale", () => {
    const raw = serializeCache(overview, now);
    expect(parseCache(raw, todayOverviewSchema, now + 1000)).toEqual({
      data: overview,
      savedAt: now,
    });
    expect(parseCache(raw, todayOverviewSchema, now + CACHE_MAX_AGE_MS + 1)).toBeNull();
    expect(
      parseCache(
        serializeCache({ ...overview, due_this_week: "many" }, now),
        todayOverviewSchema,
        now,
      ),
    ).toBeNull();
  });

  it("says what's shown and what will sync", () => {
    expect(offlineMessage({ savedAt: now, pending: 2 }, "America/Chicago")).toBe(
      "You're offline. Showing what was saved at 2:00 PM. 2 changes will sync when you're back online.",
    );
    expect(offlineMessage({ savedAt: null, pending: 0 })).toBe("You're offline.");
  });
});

// Compile-time: what api.courses.get returns fits the schema its saved copy is checked with.
export const courseDetailFitsSchema = (
  detail: Awaited<ReturnType<ApiClient["courses"]["get"]>>,
): CourseDetail => detail;
