import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@studypulse/db";
import { describe, expect, it } from "vitest";

import { createApiClient } from "./client.ts";
import { ApiError, fromPostgrestError } from "./errors.ts";

interface Call {
  kind: "rpc" | "invoke";
  name: string;
  args: unknown;
}

function fakeDb(responses: {
  rpc?: Record<string, { data: unknown; error: unknown }>;
  invoke?: Record<string, { data: unknown; error: unknown }>;
}) {
  const calls: Call[] = [];
  const db = {
    rpc: (name: string, args: unknown) => {
      calls.push({ kind: "rpc", name, args });
      const result = responses.rpc?.[name] ?? { data: null, error: null };
      return Object.assign(Promise.resolve(result), { single: () => Promise.resolve(result) });
    },
    functions: {
      invoke: (name: string, options: unknown) => {
        calls.push({ kind: "invoke", name, args: options });
        return Promise.resolve(
          responses.invoke?.[name.split("?")[0] ?? name] ?? { data: null, error: null },
        );
      },
    },
  };
  return { api: createApiClient(db as unknown as SupabaseClient<Database>), calls };
}

const uploadId = "5b1f3c6e-8d2a-4f7b-9c1e-2a3b4c5d6e7f";

describe("input validation", () => {
  it("rejects bad input with field issues before any network call", async () => {
    const { api, calls } = fakeDb({});
    const error = await api.syllabus
      .upload({ source: "text", text: "too short" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: "invalid_input" });
    expect((error as ApiError).issues[0]?.path).toBe("text");

    await expect(api.today.feed({ date: "03/01/2027" })).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(api.syllabus.commit("not-a-uuid")).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(
      api.syllabus.upload({ source: "url", url: "ftp://example.edu/x" }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(calls).toEqual([]);
  });

  it("validates commit payloads with the parser's schema", async () => {
    const { api, calls } = fakeDb({});
    const payload = {
      course: { name: "Bio" },
      categories: [{ name: "Labs", weight: 100 }],
      assignments: [
        {
          title: "Quiz",
          kind: "quiz" as const,
          category_name: "Quizzes",
          due_at: null,
          points_possible: null,
        },
      ],
    };
    await expect(api.syllabus.commit(uploadId, payload)).rejects.toMatchObject({
      issues: [
        { path: "assignments.0.category_name", message: '"Quizzes" is not one of the categories' },
      ],
    });
    expect(calls).toEqual([]);
  });
});

describe("calls", () => {
  it("calls the RPCs with the right arguments", async () => {
    const { api, calls } = fakeDb({
      rpc: {
        get_today_feed: { data: [{ title: "Midterm", rank: 1 }], error: null },
        commit_parsed_syllabus: { data: "course-id", error: null },
      },
    });
    expect(await api.today.feed({ date: "2027-03-01" })).toEqual([{ title: "Midterm", rank: 1 }]);
    expect(await api.syllabus.commit(uploadId)).toBe("course-id");
    expect(calls).toEqual([
      { kind: "rpc", name: "get_today_feed", args: { p_date: "2027-03-01" } },
      { kind: "rpc", name: "commit_parsed_syllabus", args: { p_upload_id: uploadId } },
    ]);
  });

  it("validates the Today overview response", async () => {
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
    const ok = fakeDb({ rpc: { get_today_overview: { data: overview, error: null } } });
    expect(await ok.api.today.overview()).toEqual(overview);

    const bad = fakeDb({
      rpc: { get_today_overview: { data: { ...overview, today: "soon" }, error: null } },
    });
    await expect(bad.api.today.overview()).rejects.toMatchObject({
      status: 502,
      code: "bad_response",
    });
  });

  it("rejects an unknown block status before any call", async () => {
    const { api, calls } = fakeDb({});
    await expect(
      api.plan.setBlockStatus({ id: uploadId, status: "finished" as "done" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(calls).toEqual([]);
  });

  it("maps database errors, including quota and Pro errors", async () => {
    const { api } = fakeDb({
      rpc: {
        commit_parsed_syllabus: {
          data: null,
          error: { code: "55000", message: "syllabus upload is processing, not parsed" },
        },
      },
    });
    await expect(api.syllabus.commit(uploadId)).rejects.toMatchObject({
      status: 409,
      code: "invalid_state",
    });
    expect(
      fromPostgrestError({ code: "SPL01", message: "Daily syllabus limit reached" }),
    ).toMatchObject({ status: 429, code: "parse_limit_reached" });
    expect(fromPostgrestError({ code: "SPP01", message: "Pro" })).toMatchObject({
      status: 402,
      code: "pro_required",
    });
    expect(fromPostgrestError({ code: "XX000", message: "boom" })).toMatchObject({
      status: 500,
      code: "database_error",
    });
  });

  it("maps edge function error bodies", async () => {
    const response = new Response(
      JSON.stringify({ error: "parse_limit_reached", message: "Daily limit", request_id: "req-1" }),
      {
        status: 429,
      },
    );
    const { api } = fakeDb({
      invoke: {
        "upload-syllabus": {
          data: null,
          error: Object.assign(new Error("x"), { context: response }),
        },
      },
    });
    await expect(
      api.syllabus.upload({ source: "url", url: "https://example.edu/syllabus" }),
    ).rejects.toMatchObject({
      status: 429,
      code: "parse_limit_reached",
      message: "Daily limit",
      requestId: "req-1",
    });
  });

  it("reports network failures", async () => {
    const { api } = fakeDb({
      invoke: { "plan-study": { data: null, error: new Error("fetch failed") } },
    });
    await expect(api.plan.rebuild()).rejects.toMatchObject({ status: 503, code: "network_error" });
  });
});

describe("sessions", () => {
  it("generates an id when none is given and passes offline start times", async () => {
    const { api, calls } = fakeDb({
      rpc: { start_study_session: { data: { id: "x" }, error: null } },
    });
    await api.sessions.start({ courseId: uploadId, startedAt: "2027-03-01T15:00:00Z" });
    const args = calls[0]?.args as Record<string, string>;
    expect(args.p_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(args).toMatchObject({ p_course_id: uploadId, p_started_at: "2027-03-01T15:00:00Z" });
  });

  it("surfaces overlaps as 409 conflicts", async () => {
    const { api } = fakeDb({
      rpc: {
        start_study_session: {
          data: null,
          error: { code: "23P01", message: "another study session overlaps this one" },
        },
      },
    });
    await expect(api.sessions.start({ id: uploadId, courseId: uploadId })).rejects.toMatchObject({
      status: 409,
      code: "conflict",
    });
  });
});

describe("assignments", () => {
  it("rejects a score without points possible and empty updates before calling", async () => {
    const { api, calls } = fakeDb({});
    await expect(
      api.assignments.create({ courseId: uploadId, title: "Quiz", pointsEarned: 5 }),
    ).rejects.toMatchObject({
      issues: [{ path: "pointsEarned", message: "Add points possible before entering a score" }],
    });
    await expect(api.assignments.update({ id: uploadId })).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(api.assignments.update({ id: uploadId, dueAt: "tomorrow" })).rejects.toMatchObject(
      { code: "invalid_input" },
    );
    expect(calls).toEqual([]);
  });
});
