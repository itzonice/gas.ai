import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FocusScreen } from "./FocusScreen";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const api = { sessions: { overview: vi.fn(), start: vi.fn(), stop: vi.fn() } };
vi.mock("@/components/auth/SessionProvider", () => ({ useApi: () => api }));

const course = {
  course_id: "00000000-0000-0000-0000-00000000c001",
  course_code: "BIO 201",
  course_name: "Biology",
  course_color: "#1E88E5",
};
const lab = {
  assignment_id: "00000000-0000-0000-0000-00000000a001",
  title: "Lab 3",
  due_at: "2027-03-05T05:59:00Z",
  ...course,
};
function overview(extra: Record<string, unknown> = {}) {
  return {
    timezone: "America/Chicago",
    today: "2027-03-01",
    today_minutes: 40,
    streak_days: 3,
    running: null,
    linked: null,
    choices: [lab],
    courses: [{ id: course.course_id, code: "BIO 201", name: "Biology", color: "#1E88E5" }],
    history: [
      {
        id: "00000000-0000-0000-0000-00000000e001",
        started_at: "2027-03-01T15:05:00Z",
        ended_at: "2027-03-01T15:30:00Z",
        minutes: 25,
        assignment_id: null,
        title: "Study BIO 201",
        ...course,
      },
    ],
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  api.sessions.start.mockImplementation((input: { id: string; startedAt: string }) =>
    Promise.resolve({ id: input.id, started_at: input.startedAt }),
  );
  api.sessions.stop.mockResolvedValue({});
});

describe("FocusScreen", () => {
  it("shows today's minutes, the streak, and session history", async () => {
    api.sessions.overview.mockResolvedValue(overview());
    render(<FocusScreen />);
    expect(await screen.findByRole("heading", { level: 1, name: "Focus" })).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getByText("days in a row")).toBeInTheDocument();
    const history = screen.getByRole("complementary", { name: "Session history" });
    expect(history).toHaveTextContent("Study BIO 201");
    expect(history).toHaveTextContent("Mar 1, 9:05 – 9:30 AM");
    expect(history).toHaveTextContent("25 min");
  });

  it("asks what to work on before starting", async () => {
    api.sessions.overview.mockResolvedValue(overview());
    render(<FocusScreen />);
    await userEvent.click(await screen.findByRole("button", { name: "Start focus" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose what you're working on first.");
    expect(api.sessions.start).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Working on")).toHaveFocus();
  });

  it("starts, pauses, resumes, and ends, announcing only those", async () => {
    api.sessions.overview.mockResolvedValue(overview());
    render(<FocusScreen />);
    await userEvent.selectOptions(await screen.findByLabelText("Working on"), "Lab 3 (BIO 201)");
    const timer = screen.getByRole("timer");
    expect(timer).toHaveTextContent("25:00");
    expect(timer).not.toHaveAttribute("aria-live");

    await userEvent.click(screen.getByRole("button", { name: "Start focus" }));
    expect(api.sessions.start).toHaveBeenCalledWith(
      expect.objectContaining({ courseId: course.course_id, assignmentId: lab.assignment_id }),
    );
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Focus started: 25 minutes on Lab 3.");

    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(api.sessions.stop).toHaveBeenCalledTimes(1);
    expect(status).toHaveTextContent(/Paused with 2[45] minutes left\./);

    await userEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(api.sessions.start).toHaveBeenCalledTimes(2);
    const [first, second] = api.sessions.start.mock.calls.map((c) => (c[0] as { id: string }).id);
    expect(second).not.toBe(first);
    expect(status).toHaveTextContent("Focus resumed on Lab 3.");

    await userEvent.click(screen.getByRole("button", { name: "End session" }));
    await waitFor(() => expect(status).toHaveTextContent(/^Session ended: 0 minutes on Lab 3\.$/));
    expect(api.sessions.stop).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Start focus" })).toBeInTheDocument();
  });

  it("starts right away from a task's Focus link, sized to a linked block", async () => {
    api.sessions.overview.mockResolvedValue(
      overview({ linked: { block_id: null, block_kind: null, block_minutes: 45, ...lab } }),
    );
    render(<FocusScreen assignmentId={lab.assignment_id} autoStart />);
    await waitFor(() => expect(api.sessions.start).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Focus started: 45 minutes on Lab 3.");
  });

  it("picks up a session that is already running", async () => {
    const startedAt = new Date(Date.now() - 5 * 60_000).toISOString();
    api.sessions.overview.mockResolvedValue(
      overview({
        running: {
          id: "00000000-0000-0000-0000-00000000f001",
          started_at: startedAt,
          assignment_id: lab.assignment_id,
          title: "Lab 3",
          ...course,
        },
      }),
    );
    render(<FocusScreen />);
    expect(await screen.findByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent(/^(20:00|19:5\d)$/);
  });

  it("explains a session running elsewhere", async () => {
    api.sessions.overview.mockResolvedValue(overview());
    const { ApiError } = await import("@studypulse/core/api");
    api.sessions.start.mockRejectedValue(new ApiError(409, "conflict", "overlap"));
    render(<FocusScreen />);
    await userEvent.selectOptions(await screen.findByLabelText("Working on"), "Study BIO 201");
    await userEvent.click(screen.getByRole("button", { name: "Start focus" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already running");
    expect(screen.getByRole("button", { name: "Start focus" })).toBeInTheDocument();
  });

  it("needs a course first", async () => {
    api.sessions.overview.mockResolvedValue(overview({ courses: [], choices: [] }));
    render(<FocusScreen />);
    expect(await screen.findByText("Add a course to start focusing")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start focus" })).not.toBeInTheDocument();
  });
});
