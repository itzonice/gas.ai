import { ApiError } from "@studypulse/core/api";
import type { ParseResult } from "@studypulse/core/syllabus";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewScreen } from "./ReviewScreen";
import { UploadScreen } from "./UploadScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: push }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const api = {
  syllabus: { get: vi.fn(), commit: vi.fn(), upload: vi.fn(), uploadFile: vi.fn() },
};
vi.mock("@/components/auth/SessionProvider", () => ({ useApi: () => api }));

const flags = {
  inferred_date: false,
  inferred_year: false,
  expanded_recurring: false,
  tbd: false,
  default_time: false,
  category_unmatched: false,
};
const item = (title: string, extra: Partial<ParseResult["assignments"][number]> = {}) => ({
  title,
  kind: "assignment" as const,
  category_name: "Homework",
  original_category_name: "Homework",
  due_at: "2027-01-20T15:00:00Z",
  due_date_local: "2027-01-20",
  due_time_local: "09:00",
  points_possible: 10,
  flags,
  confidence: "high" as const,
  source_quote: `${title} is due`,
  ...extra,
});
const result: ParseResult = {
  prompt_version: "v1",
  model: "test",
  timezone: "America/Chicago",
  course: {
    name: "Biology",
    code: "BIO 201",
    instructor: "Dr. Lee",
    term_start: "2027-01-11",
    term_end: "2027-05-07",
  },
  categories: [
    { name: "Homework", weight: 40, drop_lowest: null },
    { name: "Exams", weight: 60, drop_lowest: null },
  ],
  assignments: [
    item("HW 1"),
    item("Quiz week 5", {
      kind: "quiz",
      confidence: "low",
      flags: { ...flags, inferred_date: true },
      due_date_local: "2027-02-12",
    }),
  ],
  dropped: [],
  grading_scale: [],
  warnings: [],
  summary: {
    total: 2,
    high: 1,
    medium: 0,
    low: 1,
    inferred_dates: 1,
    inferred_years: 0,
    expanded_recurring: 0,
    tbd: 0,
    default_times: 0,
    categories_unmatched: 0,
  },
};
const uploadId = "5b1f3c6e-8d2a-4f7b-9c1e-2a3b4c5d6e7f";
const row = (extra: Record<string, unknown> = {}) => ({
  id: uploadId,
  status: "parsed",
  parse_result: result,
  original_filename: "bio201.pdf",
  extracted_text: "BIO 201 Syllabus\nHW 1 is due Jan 20.",
  source_url: null,
  course_id: null,
  error: null,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.syllabus.get.mockResolvedValue(row());
  api.syllabus.commit.mockResolvedValue("course-1");
});

describe("ReviewScreen", () => {
  it("lists low-confidence items first and counts them", async () => {
    render(<ReviewScreen uploadId={uploadId} />);
    const list = await screen.findByRole("list", { name: "Parsed items, needing review first" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Quiz week 5");
    expect(rows[0]).toHaveTextContent(
      "Needs review: Date worked out from a week number or class day",
    );
    expect(rows[1]).toHaveTextContent("HW 1");
    const summary = screen.getByRole("list", { name: "Summary" });
    expect(within(summary).getByText("Items needing review").nextSibling).toHaveTextContent("1");
    expect(screen.getByRole("region", { name: "Original syllabus text" })).toHaveTextContent(
      "HW 1 is due Jan 20.",
    );
  });

  it("edits an item in the drawer and confirms it", async () => {
    const user = userEvent.setup();
    render(<ReviewScreen uploadId={uploadId} />);
    await user.click(await screen.findByRole("button", { name: /^Quiz week 5/ }));
    const drawer = screen.getByRole("dialog", { name: "Edit Quiz week 5" });
    const date = within(drawer).getByLabelText("Due date");
    await user.clear(date);
    await user.type(date, "2027-02-15");
    await user.click(within(drawer).getByRole("button", { name: "Looks right" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const summary = screen.getByRole("list", { name: "Summary" });
    expect(within(summary).getByText("Items needing review").nextSibling).toHaveTextContent("0");
    expect(screen.getByRole("button", { name: /^Quiz week 5/ })).toHaveTextContent(
      "Mon, Feb 15 at 9:00 AM",
    );
  });

  it("saves the reviewed schedule, leaving out unchecked items", async () => {
    const user = userEvent.setup();
    render(<ReviewScreen uploadId={uploadId} />);
    await user.click(await screen.findByRole("checkbox", { name: "Include HW 1 in schedule" }));
    await user.click(screen.getByRole("button", { name: "Save to calendar" }));
    expect(api.syllabus.commit).toHaveBeenCalledTimes(1);
    const [id, payload] = api.syllabus.commit.mock.calls[0] as [string, { assignments: unknown[] }];
    expect(id).toBe(uploadId);
    expect(payload.assignments).toEqual([
      {
        title: "Quiz week 5",
        kind: "quiz",
        category_name: "Homework",
        due_at: "2027-02-12T15:00:00.000Z",
        points_possible: 10,
      },
    ]);
    expect(push).toHaveBeenCalledWith("/courses/course-1");
  });

  it("blocks saving with a list of problems that link to the item", async () => {
    const user = userEvent.setup();
    render(<ReviewScreen uploadId={uploadId} />);
    await user.click(await screen.findByRole("button", { name: /^HW 1/ }));
    await user.clear(within(screen.getByRole("dialog")).getByLabelText("Title"));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Save to calendar" }));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Fix 1 problem before saving.");
    expect(api.syllabus.commit).not.toHaveBeenCalled();
    await user.click(within(alert).getByRole("button", { name: /Untitled item/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renaming a category moves its items with it", async () => {
    const user = userEvent.setup();
    render(<ReviewScreen uploadId={uploadId} />);
    const categories = await screen.findByRole("list", { name: "Grade categories" });
    const name = within(categories).getAllByLabelText("Category")[0];
    if (!name) throw new Error("no category field");
    await user.clear(name);
    await user.type(name, "Problem sets");
    expect(screen.getByRole("button", { name: /^HW 1/ })).toHaveTextContent("Problem sets");
  });

  it("explains the free course limit with a link to upgrade", async () => {
    api.syllabus.commit.mockRejectedValueOnce(
      new ApiError(402, "course_limit_reached", "Free accounts can have 3 courses."),
    );
    const user = userEvent.setup();
    render(<ReviewScreen uploadId={uploadId} />);
    await user.click(await screen.findByRole("button", { name: "Save to calendar" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Free accounts can have 3 courses.");
    expect(within(alert).getByRole("link", { name: "See Pro plans" })).toHaveAttribute(
      "href",
      "/settings/upgrade",
    );
  });

  it("shows progress while the syllabus is still being read", async () => {
    api.syllabus.get.mockResolvedValue(row({ status: "processing", parse_result: null }));
    render(<ReviewScreen uploadId={uploadId} />);
    expect(await screen.findByText(/Reading/)).toHaveTextContent("Reading bio201.pdf");
  });
});

describe("UploadScreen", () => {
  it("asks for a file before uploading", async () => {
    const user = userEvent.setup();
    render(<UploadScreen />);
    await user.click(screen.getByRole("button", { name: "Read syllabus" }));
    expect(screen.getByText("Choose a file to upload.")).toBeInTheDocument();
    expect(api.syllabus.uploadFile).not.toHaveBeenCalled();
  });

  it("uploads a picked file, shows progress, then opens the review", async () => {
    api.syllabus.uploadFile.mockResolvedValue({ upload_id: uploadId, status: "pending" });
    api.syllabus.get.mockResolvedValueOnce(row({ status: "processing", parse_result: null }));
    api.syllabus.get.mockResolvedValue(row());
    const user = userEvent.setup();
    render(<UploadScreen />);
    const file = new File(["%PDF-1.7"], "bio201.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText(/Choose a file/), file);
    await user.click(screen.getByRole("button", { name: "Read syllabus" }));
    expect(api.syllabus.uploadFile).toHaveBeenCalledWith(file, { filename: "bio201.pdf" });
    expect(await screen.findByText(/Reading/)).toHaveTextContent("Reading bio201.pdf");
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith(`/courses/upload/${uploadId}`), {
      timeout: 4000,
    });
  });

  it("pastes text and shows the server's field errors", async () => {
    api.syllabus.upload.mockRejectedValueOnce(
      new ApiError(400, "invalid_input", "Some fields need attention", {
        issues: [{ path: "text", message: "Paste the whole syllabus (at least a few paragraphs)" }],
      }),
    );
    const user = userEvent.setup();
    render(<UploadScreen />);
    await user.click(screen.getByRole("radio", { name: /Paste text/ }));
    await user.type(screen.getByLabelText("Syllabus text"), "too short");
    await user.click(screen.getByRole("button", { name: "Read syllabus" }));
    expect(api.syllabus.upload).toHaveBeenCalledWith({ source: "text", text: "too short" });
    expect(await screen.findByRole("alert")).toHaveTextContent("Some fields need attention.");
    expect(screen.getByLabelText("Syllabus text")).toHaveAccessibleDescription(
      /at least a few paragraphs/,
    );
  });
});
