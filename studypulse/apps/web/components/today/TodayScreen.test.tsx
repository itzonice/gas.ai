import type { TodayFeedRow, TodayOverview } from "@studypulse/core/api";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TodayScreen } from "./TodayScreen";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const bio = "00000000-0000-0000-0000-00000000c001";
const overview: TodayOverview = {
  timezone: "America/Chicago",
  today: "2027-03-01",
  week_start: "2027-03-01",
  due_this_week: 3,
  focus_minutes_this_week: 95,
  courses_at_risk: [{ id: bio, code: "BIO 201", current: 70, target: 90 }],
  reviews: [
    {
      id: "00000000-0000-0000-0000-0000000000b1",
      kind: "review",
      status: "planned",
      starts_at: "2027-03-01T21:00:00Z",
      ends_at: "2027-03-01T21:30:00Z",
      minutes: 30,
      course_id: bio,
      assignment_id: null,
      title: "Cell biology",
    },
  ],
  next_exam: {
    id: "00000000-0000-0000-0000-0000000000a9",
    title: "Midterm",
    course_id: bio,
    due_at: "2027-03-08T15:00:00Z",
    days_until: 7,
  },
  courses: [{ id: bio, code: "BIO 201", name: "Biology", color: "#1E88E5" }],
};
const row = (title: string, rank: number, extra: Partial<TodayFeedRow> = {}): TodayFeedRow => ({
  item_type: "task",
  item_id: `00000000-0000-0000-0000-00000000000${rank}`,
  assignment_id: `00000000-0000-0000-0000-00000000000${rank}`,
  block_kind: null,
  block_status: null,
  starts_at: null,
  ends_at: null,
  capacity_minutes: 120,
  course_id: bio,
  course_name: "Biology",
  due_at: "2027-03-02T05:59:00Z",
  grade_share: 10,
  kind: "lab",
  minutes_remaining: 45,
  overdue: false,
  planned_minutes: 45,
  priority: 80,
  rank,
  status: "todo",
  studied_minutes: 0,
  title,
  ...extra,
});
const review = (title: string, rank: number, extra: Partial<TodayFeedRow> = {}): TodayFeedRow =>
  row(title, rank, {
    item_type: "review",
    item_id: `00000000-0000-0000-0000-0000000000b${rank}`,
    assignment_id: null,
    kind: null,
    status: null,
    grade_share: null,
    priority: null,
    due_at: null,
    block_kind: "review",
    block_status: "planned",
    starts_at: "2027-03-01T21:00:00Z",
    ends_at: "2027-03-01T21:30:00Z",
    planned_minutes: 30,
    ...extra,
  });

const api = {
  today: { overview: vi.fn(), feed: vi.fn() },
  assignments: { update: vi.fn() },
  plan: { setBlockStatus: vi.fn(), rebuild: vi.fn() },
};
vi.mock("@/components/auth/SessionProvider", () => ({ useApi: () => api }));

beforeEach(() => {
  // 9:00 AM in Chicago on the overview's "today". Only Date is faked; timers stay real.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2027-03-01T15:00:00Z"));
  vi.clearAllMocks();
  api.today.overview.mockResolvedValue(overview);
  api.today.feed.mockResolvedValue([
    review("Review: Cell biology", 1),
    review("Closed-note practice quiz", 2, {
      block_kind: "practice_quiz",
      starts_at: "2027-03-01T22:00:00Z",
      ends_at: "2027-03-01T22:20:00Z",
      planned_minutes: 20,
    }),
    row("Lab 1", 3, { overdue: true }),
    row("Reading", 4),
  ]);
  api.assignments.update.mockResolvedValue({});
  api.plan.setBlockStatus.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TodayScreen", () => {
  it("shows the metric cards with status in words", async () => {
    render(<TodayScreen />);
    const metrics = await screen.findByRole("list", { name: "This week" });
    expect(within(metrics).getByText("Due this week").nextSibling).toHaveTextContent("3");
    expect(within(metrics).getByText("1.6")).toBeInTheDocument();
    expect(within(metrics).getByText("At risk: BIO 201")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument();
    expect(screen.getByText("Monday, March 1")).toBeInTheDocument();
  });

  it("lists reviews before ranked tasks, in rank order", async () => {
    render(<TodayScreen />);
    await screen.findByRole("list", { name: "This week" });
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings.indexOf("Reviews due today")).toBeLessThan(headings.indexOf("Up next"));
    const tasks = screen.getByRole("list", { name: "Up next, highest priority first" });
    const titles = within(tasks)
      .getAllByRole("link")
      .map((a) => a.textContent);
    expect(titles[0]).toMatch(/^Lab 1/);
    expect(titles[1]).toMatch(/^Reading/);
    expect(within(tasks).getByText("Overdue")).toBeInTheDocument();
    expect(within(tasks).getAllByText("Due today at 11:59 PM")).toHaveLength(2);
    const reviews = screen.getByRole("list", { name: "Reviews due today" });
    const reviewTitles = within(reviews)
      .getAllByRole("link")
      .map((a) => a.textContent);
    expect(reviewTitles[0]).toMatch(/^Review: Cell biology/);
    expect(reviewTitles[1]).toMatch(/^Closed-note practice quiz/);
    expect(within(reviews).getByText("Closed notes · 20 min")).toBeInTheDocument();
  });

  it("marks tasks and reviews done through the API", async () => {
    const user = userEvent.setup();
    render(<TodayScreen />);
    await user.click(await screen.findByRole("checkbox", { name: "Mark Lab 1 done" }));
    expect(api.assignments.update).toHaveBeenCalledWith({
      id: "00000000-0000-0000-0000-000000000003",
      status: "done",
    });
    expect(await screen.findByRole("checkbox", { name: "Mark Lab 1 not done" })).toBeChecked();

    await user.click(screen.getByRole("checkbox", { name: "Mark Review: Cell biology done" }));
    expect(api.plan.setBlockStatus).toHaveBeenCalledWith({
      id: "00000000-0000-0000-0000-0000000000b1",
      status: "done",
    });
  });

  it("rolls back a checkbox when the save fails and says so", async () => {
    api.assignments.update.mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    render(<TodayScreen />);
    await user.click(await screen.findByRole("checkbox", { name: "Mark Lab 1 done" }));
    expect(await screen.findByText("Couldn't update Lab 1. Try again.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Mark Lab 1 done" })).not.toBeChecked();
  });

  it("shows the next exam in the right panel", async () => {
    render(<TodayScreen />);
    const panel = await screen.findByRole("complementary", { name: "Coming up" });
    expect(within(panel).getByText("In 7 days")).toBeInTheDocument();
    expect(within(panel).getByText("Midterm")).toBeInTheDocument();
  });

  it("offers a syllabus upload when there are no courses", async () => {
    api.today.overview.mockResolvedValue({ ...overview, reviews: [], courses: [] });
    api.today.feed.mockResolvedValue([]);
    render(<TodayScreen />);
    expect(await screen.findByRole("heading", { name: "No courses yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload a syllabus" })).toBeInTheDocument();
  });

  it("reports load errors with a retry", async () => {
    api.today.overview.mockRejectedValueOnce(new Error("Couldn't reach StudyPulse."));
    const user = userEvent.setup();
    render(<TodayScreen />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach StudyPulse.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("list", { name: "This week" })).toBeInTheDocument();
  });
});
