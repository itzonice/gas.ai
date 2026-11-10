import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SearchScreen } from "./SearchScreen";
import { expectNoAxeViolations } from "@/test/axe";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams("q=lab"),
}));

const api = {
  courses: { overview: vi.fn() },
  assignments: { list: vi.fn() },
  study: { overview: vi.fn() },
};
vi.mock("@/components/auth/SessionProvider", () => ({ useApi: () => api }));

const bio = "00000000-0000-0000-0000-00000000c001";
const chem = "00000000-0000-0000-0000-00000000c002";

beforeEach(() => {
  vi.clearAllMocks();
  api.courses.overview.mockResolvedValue({
    timezone: "America/Chicago",
    courses: [
      { id: bio, name: "Cell Biology", code: "BIO 201", color: null, instructor: "Dr. Ramírez" },
      { id: chem, name: "Chemistry", code: "CHEM 101", color: null, instructor: null },
    ],
  });
  api.study.overview.mockResolvedValue({
    timezone: "America/Chicago",
    reviewed_today: 0,
    courses: [],
    sets: [
      {
        id: "s1",
        course_id: bio,
        title: "Lab vocabulary",
        description: null,
        updated_at: "2030-03-01T00:00:00Z",
        cards: 12,
        due: 0,
        fresh: 12,
        starred: 0,
      },
    ],
    notes: [
      {
        id: "n1",
        course_id: bio,
        title: "Lab 3 notes",
        excerpt: "Enzymes speed up reactions",
        pinned: false,
        updated_at: "2030-03-01T00:00:00Z",
      },
    ],
  });
  api.assignments.list.mockResolvedValue({
    items: [
      {
        id: "a1",
        course_id: bio,
        title: "Lab 3: Enzymes",
        kind: "lab",
        due_at: "2030-03-05T05:59:00Z",
      },
      { id: "a2", course_id: chem, title: "Lab safety quiz", kind: "quiz", due_at: null },
      { id: "a3", course_id: bio, title: "Midterm", kind: "exam", due_at: null },
    ],
    nextOffset: null,
  });
});

describe("SearchScreen", () => {
  it("starts from the app bar's query and lists matching assignments", async () => {
    render(<SearchScreen />);
    expect(await screen.findByText('4 matches for "lab".')).toBeInTheDocument();
    await expectNoAxeViolations();
    const found = screen.getByRole("region", { name: "Assignments" });
    expect(
      within(found)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual([
      expect.stringContaining("Lab 3: Enzymes"),
      expect.stringContaining("Lab safety quiz"),
    ]);
  });

  it("finds card sets and notes, and links to them", async () => {
    render(<SearchScreen />);
    await screen.findByText('4 matches for "lab".');
    expect(screen.getByRole("link", { name: /Lab vocabulary/ })).toHaveAttribute(
      "href",
      "/study/sets/s1",
    );
    expect(screen.getByRole("link", { name: /Lab 3 notes/ })).toHaveAttribute(
      "href",
      "/study/notes/n1",
    );
  });

  it("still searches when card sets and notes can't be read", async () => {
    api.study.overview.mockRejectedValue(new Error("offline"));
    render(<SearchScreen />);
    expect(await screen.findByText('2 matches for "lab".')).toBeInTheDocument();
  });

  it("matches every word across course code and title, ignoring accents", async () => {
    const user = userEvent.setup();
    render(<SearchScreen />);
    const box = await screen.findByLabelText("Search courses, assignments, card sets, and notes");
    await user.clear(box);
    await user.type(box, "bio lab");
    expect(screen.getByText('3 matches for "bio lab".')).toBeInTheDocument();
    await user.clear(box);
    await user.type(box, "ramirez");
    expect(screen.getByRole("region", { name: "Courses" })).toHaveTextContent("Cell Biology");
    expect(screen.getByRole("link", { name: /Cell Biology/ })).toHaveAttribute(
      "href",
      `/courses/${bio}`,
    );
  });
});
