import { describe, expect, it, vi } from "vitest";

import {
  canvasAssignmentKind,
  canvasAssignmentSchema,
  canvasCourseSchema,
  canvasList,
  CanvasApiError,
  fetchCanvasSnapshot,
  nextLink,
  toSyncCourse,
} from "./canvas-sync.ts";

const base = "https://canvas.school.edu";

describe("nextLink", () => {
  it("finds rel=next among Canvas's Link relations", () => {
    expect(
      nextLink(
        `<${base}/api/v1/courses?page=1>; rel="current",<${base}/api/v1/courses?page=2>; rel="next",<${base}/api/v1/courses?page=1>; rel="first"`,
      ),
    ).toBe(`${base}/api/v1/courses?page=2`);
    expect(nextLink(`<${base}/x?page=1>; rel="last"`)).toBeNull();
    expect(nextLink(null)).toBeNull();
  });
});

function pages(map: Record<string, { body: unknown; link?: string; status?: number }>) {
  return vi.fn((url: string | URL | Request, _init?: RequestInit) => {
    const key = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    const page = map[key];
    if (!page) return Promise.resolve(new Response("missing", { status: 404 }));
    return Promise.resolve(
      Response.json(page.body, {
        status: page.status ?? 200,
        headers: page.link ? { link: page.link } : {},
      }),
    );
  });
}

describe("canvasList", () => {
  const schema = canvasCourseSchema;
  const p1 = `${base}/api/v1/courses?per_page=100`;
  const p2 = `${base}/api/v1/courses?page=2&per_page=100`;

  it("follows pagination and skips unreadable items", async () => {
    const fetchMock = pages({
      [p1]: { body: [{ id: 1, name: "Bio" }, { id: 2 }], link: `<${p2}>; rel="next"` },
      [p2]: { body: [{ id: "3", name: "Chem" }] },
    });
    const items = await canvasList(base, "/api/v1/courses?per_page=100", "tok", schema, {
      fetch: fetchMock,
    });
    expect(items.map((c) => c.id)).toEqual(["1", "3"]);
    expect(fetchMock.mock.calls[0]![1]!.headers).toMatchObject({ Authorization: "Bearer tok" });
  });

  it("never sends the token to another origin", async () => {
    const fetchMock = pages({
      [p1]: { body: [{ id: 1, name: "Bio" }], link: `<https://evil.test/steal>; rel="next"` },
    });
    await canvasList(base, "/api/v1/courses?per_page=100", "tok", schema, { fetch: fetchMock });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("raises CanvasApiError on HTTP errors (e.g. an expired token)", async () => {
    const fetchMock = pages({ [p1]: { body: { errors: [] }, status: 401 } });
    await expect(
      canvasList(base, "/api/v1/courses?per_page=100", "tok", schema, { fetch: fetchMock }),
    ).rejects.toBeInstanceOf(CanvasApiError);
  });
});

const assignment = (extra: Record<string, unknown>) =>
  canvasAssignmentSchema.parse({ id: 1, name: "HW", ...extra });

describe("canvasAssignmentKind", () => {
  it.each([
    [{ name: "Midterm Exam" }, "exam"],
    [{ name: "Final" }, "exam"],
    [{ name: "Chapter 3", submission_types: ["online_quiz"] }, "quiz"],
    [{ name: "Weekly Quiz 2" }, "quiz"],
    [{ name: "Intro post", submission_types: ["discussion_topic"] }, "discussion"],
    [{ name: "Lab 4: Titration" }, "lab"],
    [{ name: "Final Project" }, "project"],
    [{ name: "Group project proposal" }, "project"],
    [{ name: "Problem Set 5" }, "assignment"],
  ])("%o -> %s", (a, kind) => {
    expect(canvasAssignmentKind(assignment(a))).toBe(kind);
  });
});

describe("toSyncCourse", () => {
  const course = canvasCourseSchema.parse({
    id: 101,
    name: " Biology 201 ",
    course_code: "BIO 201",
    apply_assignment_group_weights: true,
  });

  it("maps weighted groups and assignments with the student's own scores", () => {
    const sync = toSyncCourse(
      course,
      [{ id: "7", name: "Labs", group_weight: 40, position: 1 }],
      [
        assignment({
          id: 55,
          name: "Lab 1",
          due_at: "2027-03-05T23:59:00-06:00",
          points_possible: 10,
          assignment_group_id: 7,
          updated_at: "2027-03-01T10:00:00Z",
          submission: { score: 9, workflow_state: "graded" },
        }),
        assignment({ id: 56, name: "Draft", published: false }),
      ],
    );
    expect(sync).toEqual({
      external_id: "101",
      name: "Biology 201",
      code: "BIO 201",
      weighted: true,
      groups: [{ external_id: "7", name: "Labs", weight: 40, position: 1 }],
      assignments: [
        {
          external_id: "55",
          title: "Lab 1",
          due_at: "2027-03-06T05:59:00.000Z",
          points_possible: 10,
          points_earned: 9,
          kind: "lab",
          group_external_id: "7",
          external_updated_at: "2027-03-01T10:00:00.000Z",
        },
      ],
    });
  });

  it("drops scores our schema can't hold and ignores groups for unweighted courses", () => {
    const sync = toSyncCourse(
      { ...course, apply_assignment_group_weights: false },
      [{ id: "7", name: "Labs", group_weight: 40, position: 1 }],
      [
        assignment({ id: 1, points_possible: 0, submission: { score: 5 } }),
        assignment({ id: 2, points_possible: 10, submission: { score: 25 } }),
        assignment({ id: 3, points_possible: 10, submission: { score: 8, excused: true } }),
        assignment({ id: 4, points_possible: 10, assignment_group_id: 7, due_at: "not a date" }),
      ],
    );
    expect(sync.groups).toEqual([]);
    expect(
      sync.assignments.map((a) => [
        a.points_possible,
        a.points_earned,
        a.group_external_id,
        a.due_at,
      ]),
    ).toEqual([
      [null, null, null, null],
      [10, null, null, null],
      [10, null, null, null],
      [10, null, null, null],
    ]);
  });
});

describe("fetchCanvasSnapshot", () => {
  it("reads courses, groups (weighted only), and assignments with submissions", async () => {
    const fetchMock = pages({
      [`${base}/api/v1/courses?enrollment_type=student&enrollment_state=active&per_page=100`]: {
        body: [
          { id: 1, name: "Bio", apply_assignment_group_weights: true },
          { id: 2, name: "Chem", apply_assignment_group_weights: false },
        ],
      },
      [`${base}/api/v1/courses/1/assignment_groups?per_page=100`]: {
        body: [{ id: 9, name: "Exams", group_weight: 100 }],
      },
      [`${base}/api/v1/courses/1/assignments?include[]=submission&order_by=due_at&per_page=100`]: {
        body: [{ id: 11, name: "Midterm", assignment_group_id: 9 }],
      },
      [`${base}/api/v1/courses/2/assignments?include[]=submission&order_by=due_at&per_page=100`]: {
        body: [{ id: 21, name: "HW 1" }],
      },
    });
    const snapshot = await fetchCanvasSnapshot(base, "tok", { fetch: fetchMock });
    expect(snapshot.map((c) => [c.external_id, c.groups.length, c.assignments.length])).toEqual([
      ["1", 1, 1],
      ["2", 0, 1],
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(4); // no groups request for the unweighted course
  });
});
