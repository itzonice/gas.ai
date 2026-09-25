import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CourseDetailScreen } from "./CourseDetailScreen";
import { CoursesScreen } from "./CoursesScreen";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const api = {
  courses: { overview: vi.fn(), get: vi.fn(), setTarget: vi.fn() },
  assignments: { update: vi.fn() },
};
vi.mock("@/components/auth/SessionProvider", () => ({ useApi: () => api }));

const courseId = "00000000-0000-0000-0000-00000000c001";
const detail = {
  course: {
    id: courseId,
    name: "Biology",
    code: "BIO 201",
    color: "#1E88E5",
    instructor: "Dr. Lee",
    term_start: null,
    term_end: null,
    target_grade: 85,
    letter_scale: null,
    archived_at: null,
  },
  categories: [
    { id: "hw", name: "Homework", weight: 40, drop_lowest: 0, position: 0 },
    { id: "ex", name: "Exams", weight: 60, drop_lowest: 0, position: 1 },
  ],
  assignments: [
    {
      id: "h1",
      title: "HW 1",
      kind: "assignment",
      status: "done",
      due_at: "2026-09-01T04:59:00Z",
      category_id: "hw",
      points_earned: 9,
      points_possible: 10,
      source: "syllabus",
    },
    {
      id: "m1",
      title: "Midterm",
      kind: "exam",
      status: "done",
      due_at: "2026-10-01T15:00:00Z",
      category_id: "ex",
      points_earned: 70,
      points_possible: 100,
      source: "syllabus",
    },
    {
      id: "h2",
      title: "HW 2",
      kind: "assignment",
      status: "todo",
      due_at: "2026-09-10T04:59:00Z",
      category_id: "hw",
      points_earned: null,
      points_possible: 10,
      source: "syllabus",
    },
    {
      id: "fin",
      title: "Final Exam",
      kind: "exam",
      status: "todo",
      due_at: "2026-12-15T15:00:00Z",
      category_id: "ex",
      points_earned: null,
      points_possible: 100,
      source: "syllabus",
    },
  ],
  timezone: "America/Chicago",
};

beforeEach(() => {
  vi.clearAllMocks();
  api.courses.overview.mockResolvedValue({
    timezone: "America/Chicago",
    courses: [
      {
        id: courseId,
        name: "Biology",
        code: "BIO 201",
        color: "#1E88E5",
        instructor: null,
        target_grade: 90,
        current_grade: 78,
        letter: "C+",
        open_count: 2,
        next_due: { id: "h2", title: "HW 2", kind: "assignment", due_at: "2030-09-10T04:59:00Z" },
      },
    ],
  });
  api.courses.get.mockResolvedValue(detail);
  api.assignments.update.mockResolvedValue({});
  api.courses.setTarget.mockResolvedValue(undefined);
});

describe("CoursesScreen", () => {
  it("shows a card per course with its code, grade, target status in words, and next due", async () => {
    render(<CoursesScreen />);
    const list = await screen.findByRole("list", { name: "Courses" });
    const card = within(list).getByRole("link", { name: /BIO 201/ });
    expect(card).toHaveAttribute("href", `/courses/${courseId}`);
    expect(card).toHaveTextContent("78% · C+");
    expect(card).toHaveTextContent("Below your 90% target");
    expect(card).toHaveTextContent("Next: HW 2, due Mon, Sep 9 at 11:59 PM"); // Chicago time
    expect(screen.getByRole("link", { name: "Upload syllabus" })).toHaveAttribute(
      "href",
      "/courses/upload",
    );
  });

  it("offers an upload when there are no courses", async () => {
    api.courses.overview.mockResolvedValue({ timezone: "UTC", courses: [] });
    render(<CoursesScreen />);
    expect(await screen.findByRole("heading", { name: "No courses yet" })).toBeInTheDocument();
  });
});

describe("CourseDetailScreen", () => {
  it("shows the grade, target, and score needed on the final", async () => {
    render(<CourseDetailScreen courseId={courseId} />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "BIO 201 Biology" }),
    ).toBeInTheDocument();
    const metrics = screen.getByRole("list", { name: "Grade" });
    // 0.4 * 90 + 0.6 * 70 = 78
    expect(within(metrics).getByText("Current grade").nextSibling).toHaveTextContent("78% · C+");
    expect(within(metrics).getByText("Below your 85% target")).toBeInTheDocument();
    // (70 + f) / 2 = (85 - 36) / 0.6 => f = 93.4 (rounded up)
    expect(within(metrics).getByText("Needed on the final").nextSibling).toHaveTextContent("93.4%");
    expect(
      within(metrics).getByText("On Final Exam, with other work as it stands"),
    ).toBeInTheDocument();
  });

  it("lists category weights and assignments in a table with an overdue status in words", async () => {
    render(<CourseDetailScreen courseId={courseId} />);
    const weights = await screen.findByRole("list", { name: "Grade categories" });
    expect(within(weights).getByText("40% of grade · you: 90%")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: /Assignments in BIO 201 Biology/ });
    const hw2 = within(table).getByRole("row", { name: /HW 2/ });
    expect(hw2).toHaveTextContent("Overdue");
    expect(within(table).getByRole("row", { name: /Midterm/ })).toHaveTextContent("70 / 100 (70%)");
  });

  it("projects the grade from what-if scores", async () => {
    const user = userEvent.setup();
    render(<CourseDetailScreen courseId={courseId} />);
    const panel = await screen.findByRole("complementary", { name: "What if?" });
    await user.type(within(panel).getByLabelText("Final Exam"), "90");
    const output = within(panel).getByRole("status");
    // Exams (70 + 90) / 200 = 80% => 0.4 * 90 + 0.6 * 80 = 84
    expect(output).toHaveTextContent("Projected grade84% · B");
    expect(output).toHaveTextContent("Up 6 points");
    await user.click(within(panel).getByRole("button", { name: "Clear what-ifs" }));
    expect(output).toHaveTextContent("Current grade78%");
  });

  it("adds a score through the dialog", async () => {
    const user = userEvent.setup();
    render(<CourseDetailScreen courseId={courseId} />);
    await user.click(await screen.findByRole("button", { name: "Add score" }));
    const dialog = screen.getByRole("dialog", { name: "Add score" });
    expect(within(dialog).getByLabelText("Assignment")).toHaveValue("h2");
    expect(within(dialog).getByLabelText("Points possible")).toHaveValue(10);
    await user.type(within(dialog).getByLabelText("Points earned"), "8.5");
    await user.click(within(dialog).getByRole("button", { name: "Save score" }));
    expect(api.assignments.update).toHaveBeenCalledWith({
      id: "h2",
      pointsEarned: 8.5,
      pointsPossible: 10,
      status: "done",
    });
    expect(api.courses.get).toHaveBeenCalledTimes(2);
  });

  it("says when a course doesn't exist", async () => {
    api.courses.get.mockRejectedValue(
      Object.assign(new Error("Course not found"), { status: 404 }),
    );
    render(<CourseDetailScreen courseId={courseId} />);
    expect(await screen.findByRole("heading", { name: "Course not found" })).toBeInTheDocument();
  });
});
