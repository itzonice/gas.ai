import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { barWidth, correlation, statsCsv, summarize } from "./model";
import { StatsScreen } from "./StatsScreen";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const api = { stats: { overview: vi.fn() } };
vi.mock("@/components/auth/SessionProvider", () => ({ useApi: () => api }));

const course = (
  code: string,
  focus: number,
  grade: number | null,
  target: number | null = null,
  n = 1,
) => ({
  id: `00000000-0000-0000-0000-00000000c00${n}`,
  code,
  name: `${code} name`,
  color: "#1E88E5",
  target_grade: target,
  current_grade: grade,
  letter: grade === null ? null : "B",
  focus_minutes: focus,
});

function stats(
  courses = [
    course("BIO 201", 390, 84, 90, 1),
    course("MATH 221", 120, 72, null, 2),
    course("PSYC 101", 600, 91, null, 3),
    course("NEW 100", 0, null, null, 4),
  ],
) {
  return {
    timezone: "America/Chicago",
    today: "2027-03-03",
    week_start: "2027-03-01",
    period_start: "2027-02-08",
    weeks: 4,
    this_week_minutes: 95,
    weekly: [
      { week_start: "2027-02-08", minutes: 300 },
      { week_start: "2027-02-15", minutes: 400 },
      { week_start: "2027-02-22", minutes: 315 },
      { week_start: "2027-03-01", minutes: 95 },
    ],
    average_grade: 82.33,
    courses,
  };
}

describe("stats model", () => {
  it("summarizes in plain sentences", () => {
    expect(summarize(stats())).toEqual([
      "In the last 4 weeks you focused 18 h 30 min across 3 courses.",
      "Most focus: PSYC 101, 10 h, grade 91%.",
      "Lowest grade: MATH 221, 72%, with 2 h of focus.",
      "Below target: BIO 201 (84%, target 90%).",
      "Courses you focused on more tend to have higher grades.",
      "No grades yet: NEW 100.",
    ]);
    expect(summarize(stats([course("BIO 201", 0, null)]))).toEqual([
      "No focus time logged in the last 4 weeks.",
      "No grades yet: BIO 201.",
    ]);
  });

  it("only claims a link with enough courses", () => {
    expect(
      correlation([
        [1, 2],
        [2, 4],
      ]),
    ).toBeNull();
    expect(
      correlation([
        [1, 5],
        [2, 5],
        [3, 5],
      ]),
    ).toBeNull();
    expect(
      correlation([
        [1, 3],
        [2, 2],
        [3, 1],
      ]),
    ).toBeCloseTo(-1);
  });

  it("scales bars, keeping small values visible", () => {
    expect(barWidth(0, 100)).toBe(0);
    expect(barWidth(1, 1000)).toBe(2);
    expect(barWidth(50, 100)).toBe(50);
  });

  it("exports CSV that spreadsheets won't run as formulas", () => {
    const csv = statsCsv(stats([{ ...course("=HYPERLINK(1)", 30, 88.5), name: 'Bio, "honors"' }]));
    expect(csv).toBe(
      "course_code,course_name,period_start,period_end,focus_minutes,current_grade,letter,target_grade\r\n" +
        `'=HYPERLINK(1),"Bio, ""honors""",2027-02-08,2027-03-03,30,88.5,B,\r\n`,
    );
  });
});

describe("StatsScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.stats.overview.mockResolvedValue(stats());
  });

  it("shows metrics, the summary, and each course's numbers in text", async () => {
    render(<StatsScreen />);
    expect(await screen.findByRole("heading", { level: 1, name: "Stats" })).toBeInTheDocument();
    expect(screen.getByText("1.6")).toBeInTheDocument();
    expect(screen.getByText("82.3%")).toBeInTheDocument();
    const chart = screen.getByRole("list", { name: /Focus time and grade by course/ });
    expect(chart).toHaveAccessibleDescription(/Most focus: PSYC 101/);
    const rows = within(chart).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("BIO 201");
    expect(rows[0]).toHaveTextContent("6 h 30 min");
    expect(rows[0]).toHaveTextContent("84% · B, below 90% target");
    expect(rows[3]).toHaveTextContent("None");
    expect(rows[3]).toHaveTextContent("No grade yet");
  });

  it("switches the period", async () => {
    render(<StatsScreen />);
    const eight = await screen.findByRole("button", { name: "Last 8 weeks" });
    expect(eight).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(eight);
    expect(api.stats.overview).toHaveBeenLastCalledWith(8);
    expect(await screen.findByRole("button", { name: "Last 8 weeks" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("exports a CSV file", async () => {
    const create = vi.fn(() => "blob:x");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    render(<StatsScreen />);
    await userEvent.click(await screen.findByRole("button", { name: "Export" }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Stats exported as a CSV file.");
  });

  it("offers a syllabus upload with no courses", async () => {
    api.stats.overview.mockResolvedValue(stats([]));
    render(<StatsScreen />);
    expect(await screen.findByText("No courses yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export" })).not.toBeInTheDocument();
  });
});
