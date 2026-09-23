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
      return Promise.resolve(responses.rpc?.[name] ?? { data: null, error: null });
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
