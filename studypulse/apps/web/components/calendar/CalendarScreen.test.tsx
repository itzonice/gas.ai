import type { CalendarRange } from "@studypulse/core/api";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarScreen } from "./CalendarScreen";
import { expectNoAxeViolations } from "@/test/axe";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const bio = "00000000-0000-0000-0000-00000000c001";
const range = (from: string, to: string): CalendarRange => ({
  timezone: "America/Chicago",
  today: "2026-10-14",
  from,
  to,
  items: [
    {
      type: "due",
      id: "00000000-0000-0000-0000-0000000000a1",
      title: "Lab 3",
      kind: "lab",
      status: "todo",
      course_id: bio,
      date: "2026-10-14",
      starts_at: "2026-10-15T04:59:00Z",
      ends_at: null,
      overdue: false,
    },
    {
      type: "study",
      id: "00000000-0000-0000-0000-0000000000b1",
      title: "Midterm",
      kind: "exam_prep",
      status: "planned",
      course_id: bio,
      date: "2026-10-15",
      starts_at: "2026-10-15T21:00:00Z",
      ends_at: "2026-10-15T22:00:00Z",
      overdue: false,
    },
  ],
  courses: [{ id: bio, code: "BIO 201", name: "Biology", color: "#1E88E5" }],
});

const api = {
  calendar: { range: vi.fn() },
  assignments: { create: vi.fn() },
};
vi.mock("@/components/auth/SessionProvider", () => ({ useApi: () => api }));

beforeEach(() => {
  vi.clearAllMocks();
  api.calendar.range.mockImplementation(({ from, to }: { from: string; to: string }) =>
    Promise.resolve(range(from, to)),
  );
  api.assignments.create.mockResolvedValue({});
});

const selectedCell = () => screen.getByRole("gridcell", { selected: true });

describe("CalendarScreen", () => {
  it("opens on the user's today and describes each day in words", async () => {
    render(<CalendarScreen />);
    const grid = await screen.findByRole("grid", { name: "October 2026" });
    await expectNoAxeViolations();
    await vi.waitFor(() => {
      expect(selectedCell()).toHaveTextContent("Wednesday, October 14, today. 1 item: 1 due.");
    });
    expect(within(grid).getAllByRole("columnheader")).toHaveLength(7);
    const panel = screen.getByRole("complementary", { name: /Wednesday, October 14/ });
    expect(within(panel).getByRole("link", { name: "Lab 3" })).toBeInTheDocument();
    expect(within(panel).getByText("Due 11:59 PM")).toBeInTheDocument();
  });

  it("moves between days with the keyboard and keeps focus on the selected day", async () => {
    const user = userEvent.setup();
    render(<CalendarScreen />);
    await vi.waitFor(() => {
      expect(selectedCell()).toHaveAttribute("data-date", "2026-10-14");
    });
    selectedCell().focus();
    await user.keyboard("{ArrowRight}");
    expect(selectedCell()).toHaveAttribute("data-date", "2026-10-15");
    expect(selectedCell()).toHaveFocus();
    expect(
      within(screen.getByRole("complementary", { name: /Thursday, October 15/ })).getByText(
        /Exam prep 4:00\s?–\s?5:00\sPM/,
      ),
    ).toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Home}");
    expect(selectedCell()).toHaveAttribute("data-date", "2026-10-19");
    await user.keyboard("{PageDown}");
    expect(await screen.findByRole("grid", { name: "November 2026" })).toBeInTheDocument();
    expect(api.calendar.range).toHaveBeenLastCalledWith({ from: "2026-10-26", to: "2026-12-06" });
    await vi.waitFor(() => {
      expect(selectedCell()).toHaveFocus();
    });
    expect(selectedCell()).toHaveAttribute("data-date", "2026-11-19");
  });

  it("switches to a week view", async () => {
    const user = userEvent.setup();
    render(<CalendarScreen />);
    await screen.findByRole("grid", { name: "October 2026" });
    await user.click(screen.getByRole("button", { name: "Week" }));
    expect(screen.getByRole("button", { name: "Week" })).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByRole("grid", { name: /Oct 12\s?–\s?18, 2026/ })).toBeInTheDocument();
    expect(screen.getAllByRole("gridcell")).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Next week" })).toBeInTheDocument();
  });

  it("adds an assignment due on the selected day in the user's timezone", async () => {
    const user = userEvent.setup();
    render(<CalendarScreen />);
    await vi.waitFor(() => {
      expect(selectedCell()).toHaveAttribute("data-date", "2026-10-14");
    });
    await user.click(screen.getByRole("button", { name: "Add assignment" }));
    const dialog = screen.getByRole("dialog", { name: "Add assignment" });
    expect(within(dialog).getByLabelText("Course")).toHaveValue(bio); // the only course
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(within(dialog).getByText("Give it a title.")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Title"), "Problem Set 6");
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(api.assignments.create).toHaveBeenCalledWith({
      courseId: bio,
      title: "Problem Set 6",
      kind: "assignment",
      dueAt: "2026-10-15T04:59:00.000Z", // 11:59 PM CDT
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText("Problem Set 6 added.")).toBeInTheDocument();
  });

  it("reports load errors with a retry", async () => {
    api.calendar.range.mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    render(<CalendarScreen />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load the calendar: offline",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("grid", { name: "October 2026" })).toBeInTheDocument();
  });
});
