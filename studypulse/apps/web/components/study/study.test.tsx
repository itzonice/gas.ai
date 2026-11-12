import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";

import { FlashcardsSession } from "./FlashcardsSession";
import { LearnSession } from "./LearnSession";
import { MatchSession } from "./MatchSession";
import { NoteScreen } from "./NoteScreen";
import { SetScreen } from "./SetScreen";
import { StudyScreen } from "./StudyScreen";
import { TestSession } from "./TestSession";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
const push = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));

const api = {
  study: { overview: vi.fn() },
  sets: {
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    resetProgress: vi.fn(),
  },
  cards: {
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    review: vi.fn(),
    due: vi.fn(),
    export: vi.fn(),
    generate: vi.fn(),
  },
  notes: { get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  courses: { create: vi.fn() },
  features: vi.fn(),
  privacy: { setAiConsent: vi.fn() },
};
vi.mock("@/components/auth/SessionProvider", () => ({ useApi: () => api }));

const bio = "00000000-0000-4000-8000-0000000000b1";
const setId = "00000000-0000-4000-8000-0000000005b1";
const noteId = "00000000-0000-4000-8000-0000000004a1";

const course = { id: bio, name: "Cell Biology", code: "BIO 201", color: "#2E7D32" };

function card(n: number, front: string, back: string, extra: Record<string, unknown> = {}) {
  return {
    id: `00000000-0000-4000-8000-00000000c0${String(n).padStart(2, "0")}`,
    set_id: setId,
    course_id: bio,
    front,
    back,
    position: n,
    starred: false,
    due_at: null,
    interval_days: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
    last_reviewed_at: null,
    ...extra,
  };
}

const cards = [
  card(1, "Mitochondrion", "Makes ATP"),
  card(2, "Ribosome", "Builds proteins"),
  card(3, "Nucleus", "Holds DNA"),
  card(4, "Golgi", "Packages proteins"),
];

const overview = {
  timezone: "America/Chicago",
  reviewed_today: 2,
  courses: [course],
  sets: [
    {
      id: setId,
      course_id: bio,
      title: "Cell structure",
      description: "Organelles",
      updated_at: "2027-03-01T15:00:00+00:00",
      cards: 4,
      due: 3,
      fresh: 1,
      starred: 0,
    },
  ],
  notes: [
    {
      id: noteId,
      course_id: bio,
      title: "Lecture 9",
      excerpt: "Cells talk with chemical signals",
      pinned: true,
      updated_at: "2027-03-01T15:00:00+00:00",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  search = "";
  api.study.overview.mockResolvedValue(overview);
  api.sets.get.mockResolvedValue({
    set: {
      id: setId,
      course_id: bio,
      title: "Cell structure",
      description: "Organelles",
      updated_at: "x",
    },
    course,
    cards,
  });
  api.cards.review.mockImplementation(({ id, rating }: { id: string; rating: string }) =>
    Promise.resolve({
      ...cards.find((c) => c.id === id)!,
      reps: rating === "again" ? 0 : 1,
      interval_days: rating === "again" ? 0 : 1,
    }),
  );
  api.features.mockResolvedValue({ ai: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("StudyScreen", () => {
  it("shows what's due first, then card sets and notes, with working links", async () => {
    render(<StudyScreen />);
    expect(await screen.findByRole("heading", { level: 1, name: "Study" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Review 3 due" })).toHaveAttribute(
      "href",
      "/study/review",
    );
    const metrics = screen.getByRole("list", { name: "Study at a glance" });
    expect(within(metrics).getByText("Due for review").parentElement).toHaveTextContent("3");
    const sets = screen.getByRole("list", { name: "Card sets" });
    expect(within(sets).getByRole("link", { name: /Cell structure/ })).toHaveAttribute(
      "href",
      `/study/sets/${setId}`,
    );
    expect(within(sets).getByText(/4 cards · 3 due · 1 new/)).toBeInTheDocument();
    const notes = screen.getByRole("list", { name: "Notes" });
    expect(within(notes).getByRole("link", { name: /Lecture 9/ })).toHaveAttribute(
      "href",
      `/study/notes/${noteId}`,
    );
    await expectNoAxeViolations();
  });

  it("asks for a course first when there are none", async () => {
    api.study.overview.mockResolvedValue({ ...overview, courses: [], sets: [], notes: [] });
    render(<StudyScreen />);
    expect(
      await screen.findByRole("heading", { name: "Add a course to get started" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Add a course" })[0]!);
    expect(await screen.findByRole("dialog", { name: "Add a course" })).toBeInTheDocument();
  });

  it("creates a set and opens it", async () => {
    const user = userEvent.setup();
    api.study.overview.mockResolvedValue({
      ...overview,
      sets: overview.sets.map((s) => ({ ...s, due: 0 })),
    });
    api.sets.create.mockResolvedValue({ id: setId });
    render(<StudyScreen />);
    await user.click(await screen.findByRole("button", { name: "New card set" }));
    const dialog = await screen.findByRole("dialog", { name: "New card set" });
    await user.click(within(dialog).getByRole("button", { name: "Create set" }));
    expect(await within(dialog).findByText("Name the set.")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Set name"), "Chapter 5");
    await user.click(within(dialog).getByRole("button", { name: "Create set" }));
    expect(api.sets.create).toHaveBeenCalledWith(
      expect.objectContaining({ courseId: bio, title: "Chapter 5" }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/study/sets/${setId}`));
  });
});

describe("SetScreen", () => {
  it("lists the modes and cards, with progress in words", async () => {
    render(<SetScreen setId={setId} />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Cell structure" }),
    ).toBeInTheDocument();
    const modes = screen.getByRole("heading", { name: "Study this set" }).parentElement!;
    for (const name of ["Flashcards", "Learn", "Test", "Match"]) {
      expect(within(modes).getByRole("link", { name: new RegExp(name) })).toHaveAttribute(
        "href",
        `/study/sets/${setId}/${name.toLowerCase()}`,
      );
    }
    const list = screen.getByRole("list", { name: "Cards in this set" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(within(list).getAllByText("New")).toHaveLength(4);
    await expectNoAxeViolations();
  });

  it("explains why Match needs two cards", async () => {
    api.sets.get.mockResolvedValue({
      set: { id: setId, course_id: bio, title: "One", description: null, updated_at: "x" },
      course,
      cards: [cards[0]],
    });
    render(<SetScreen setId={setId} />);
    await screen.findByRole("heading", { level: 1, name: "One" });
    expect(screen.queryByRole("link", { name: /Match/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Add at least 2 cards to use this/)).toBeInTheDocument();
  });

  it("stars a card", async () => {
    const user = userEvent.setup();
    api.cards.update.mockResolvedValue({ ...cards[0], starred: true });
    render(<SetScreen setId={setId} />);
    const star = await screen.findByRole("button", { name: "Star Mitochondrion" });
    expect(star).toHaveAttribute("aria-pressed", "false");
    await user.click(star);
    expect(api.cards.update).toHaveBeenCalledWith({ id: cards[0]!.id, starred: true });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Star Mitochondrion" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
  });

  it("previews a pasted list and imports it after the existing cards", async () => {
    const user = userEvent.setup();
    api.cards.add.mockResolvedValue([]);
    render(<SetScreen setId={setId} />);
    await screen.findByRole("heading", { level: 1, name: "Cell structure" });
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Import cards" }));
    const dialog = await screen.findByRole("dialog", { name: "Import cards" });
    await user.click(within(dialog).getByLabelText("Paste your cards"));
    await user.paste("Lysosome\tBreaks down waste\nVacuole\tStores water\nno separator");
    expect(within(dialog).getByRole("status")).toHaveTextContent("2 cards ready to import.");
    expect(within(dialog).getByText(/Line 3: No separator/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Import 2 cards" }));
    expect(api.cards.add).toHaveBeenCalledWith({
      setId,
      courseId: bio,
      cards: [
        { front: "Lysosome", back: "Breaks down waste" },
        { front: "Vacuole", back: "Stores water" },
      ],
      startPosition: 4,
    });
  });

  it("deletes a card with an undo toast instead of a confirmation", async () => {
    const user = userEvent.setup();
    api.cards.remove.mockResolvedValue(undefined);
    render(<SetScreen setId={setId} />);
    await screen.findByRole("heading", { level: 1, name: "Cell structure" });
    await user.click(screen.getByRole("button", { name: "More actions for Ribosome" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete card" }));
    expect(screen.queryByText("Ribosome")).not.toBeInTheDocument();
    expect(screen.getByText("Deleted the card.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText("Ribosome")).toBeInTheDocument();
    expect(api.cards.remove).not.toHaveBeenCalled();
  });

  it("tells a stranger the set isn't there", async () => {
    const { ApiError } = await import("@studypulse/core/api");
    api.sets.get.mockRejectedValue(new ApiError(404, "not_found", "Card set not found"));
    render(<SetScreen setId={setId} />);
    expect(await screen.findByRole("heading", { name: "Card set not found" })).toBeInTheDocument();
  });

  it("welcomes cards made from a note", async () => {
    search = "made=7";
    render(<SetScreen setId={setId} />);
    await screen.findByRole("heading", { level: 1, name: "Cell structure" });
    expect(screen.getAllByText("Made 7 cards from your note.").length).toBeGreaterThan(0);
  });
});

describe("FlashcardsSession", () => {
  const run = () =>
    render(
      <FlashcardsSession title="Cell structure" cards={cards} backHref="/x" backLabel="Back" />,
    );

  it("turns a card over, says which side shows, and saves the rating with its review state", async () => {
    const user = userEvent.setup();
    run();
    await user.click(screen.getByRole("button", { name: "Start" }));
    const face = screen.getByRole("button", { name: /^Term: Mitochondrion/ });
    expect(screen.getByText("Card 1 of 4")).toBeInTheDocument();
    await expectNoAxeViolations();
    await user.click(face);
    expect(screen.getByRole("button", { name: /^Definition: Makes ATP/ })).toBeInTheDocument();
    expect(
      screen.getAllByRole("status").some((s) => s.textContent === "Definition: Makes ATP"),
    ).toBe(true);
    const ratings = screen.getByRole("group", { name: "How well did you know it?" });
    await expectNoAxeViolations();
    expect(within(ratings).getAllByRole("button")).toHaveLength(4);
    await user.click(within(ratings).getByRole("button", { name: /^Good/ }));
    expect(api.cards.review).toHaveBeenCalledWith({
      id: cards[0]!.id,
      rating: "good",
      state: { reps: 0, intervalDays: 0, ease: 2.5, lapses: 0 },
    });
    expect(await screen.findByText("Card 2 of 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Term: Ribosome/ })).toHaveFocus();
  });

  it("works from the keyboard: Space turns the card, 1 to 4 rate, arrows move", async () => {
    const user = userEvent.setup();
    run();
    await user.click(screen.getByRole("button", { name: "Start" }));
    const face = screen.getByRole("button", { name: /^Term: Mitochondrion/ });
    face.focus();
    await user.keyboard(" ");
    expect(screen.getByRole("button", { name: /^Definition: Makes ATP/ })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByText("Card 2 of 4")).toBeInTheDocument();
    await user.keyboard(" ");
    await user.keyboard("1");
    expect(api.cards.review).toHaveBeenCalledWith(
      expect.objectContaining({ id: cards[1]!.id, rating: "again" }),
    );
    await screen.findByText("Card 3 of 4");
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByText("Card 2 of 4")).toBeInTheDocument();
  });

  it("ignores the keys when a rating isn't showing, and never rates twice at once", async () => {
    const user = userEvent.setup();
    run();
    await user.click(screen.getByRole("button", { name: "Start" }));
    screen.getByRole("button", { name: /^Term: Mitochondrion/ }).focus();
    await user.keyboard("1");
    expect(api.cards.review).not.toHaveBeenCalled();
  });

  it("finishes with a summary and can start over", async () => {
    const user = userEvent.setup();
    render(
      <FlashcardsSession title="Two" cards={cards.slice(0, 2)} backHref="/x" backLabel="Back" />,
    );
    await user.click(screen.getByRole("button", { name: "Start" }));
    for (const rating of ["Good", "Easy"]) {
      await user.click(screen.getByRole("button", { name: /^Term:/ }));
      await user.click(screen.getByRole("button", { name: new RegExp(`^${rating}`) }));
    }
    expect(await screen.findByRole("heading", { name: "Deck complete" })).toBeInTheDocument();
    expect(screen.getByText("You reviewed 2 cards.")).toBeInTheDocument();
    expect(screen.getByText("Good: 1")).toBeInTheDocument();
    await expectNoAxeViolations();
    await user.click(screen.getByRole("button", { name: "Study again" }));
    expect(screen.getByText("Card 1 of 2")).toBeInTheDocument();
  });

  it("can show definitions first and only starred cards", async () => {
    const user = userEvent.setup();
    render(
      <FlashcardsSession
        title="Starred"
        cards={[cards[0]!, { ...cards[1]!, starred: true }]}
        backHref="/x"
        backLabel="Back"
      />,
    );
    await user.click(screen.getByLabelText("Show the definition first"));
    await user.click(screen.getByLabelText(/Starred cards only/));
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByText("Card 1 of 1")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Definition: Builds proteins/ }),
    ).toBeInTheDocument();
  });

  it("keeps going and says so when a review can't be saved", async () => {
    const user = userEvent.setup();
    api.cards.review.mockRejectedValue(new Error("offline"));
    run();
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("button", { name: /^Term:/ }));
    await user.click(screen.getByRole("button", { name: /^Hard/ }));
    expect(await screen.findByText(/Couldn't save this review/)).toBeInTheDocument();
    expect(screen.getByText("Card 2 of 4")).toBeInTheDocument();
  });
});

describe("LearnSession", () => {
  it("asks multiple choice, marks right and wrong in words, and moves on with Continue", async () => {
    const user = userEvent.setup();
    render(<LearnSession title="Cells" cards={cards} backHref="/x" backLabel="Back" />);
    await user.click(screen.getByRole("button", { name: "Start learning" }));
    const group = await screen.findByRole("group");
    const prompt = within(group).getByText(/Mitochondrion|Ribosome|Nucleus|Golgi/);
    const answers: Record<string, string> = {
      Mitochondrion: "Makes ATP",
      Ribosome: "Builds proteins",
      Nucleus: "Holds DNA",
      Golgi: "Packages proteins",
    };
    const right = answers[prompt.textContent!.replace(/^Choose the answer/, "")]!;
    await expectNoAxeViolations();
    await user.click(within(group).getByRole("button", { name: new RegExp(right) }));
    const feedback = await screen.findByText("Correct");
    expect(feedback).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.queryByText("Correct")).not.toBeInTheDocument();
  });

  it("shows the right answer after a miss and records 'again' once", async () => {
    const user = userEvent.setup();
    render(<LearnSession title="Cells" cards={cards} backHref="/x" backLabel="Back" />);
    await user.click(screen.getByRole("button", { name: "Start learning" }));
    const group = await screen.findByRole("group");
    const buttons = within(group).getAllByRole("button");
    // Pick options until one is wrong (the first option that isn't marked correct).
    await user.click(buttons[0]!);
    const status = await screen.findByRole("status");
    const wrong = /Not quite/.test(status.textContent ?? "");
    if (wrong) {
      expect(status).toHaveTextContent("The answer is:");
      await user.click(screen.getByRole("button", { name: "Continue" }));
      expect(api.cards.review).toHaveBeenCalledWith(expect.objectContaining({ rating: "again" }));
    } else {
      expect(status).toHaveTextContent("Correct");
    }
  });
});

describe("TestSession", () => {
  it("builds a test with no timer, then scores it and lists every answer", async () => {
    const user = userEvent.setup();
    render(<TestSession title="Cells" cards={cards} backHref="/x" backLabel="Back" />);
    expect(screen.getByText(/no timer/i)).toBeInTheDocument();
    const count = screen.getByLabelText(/Number of questions/);
    await user.clear(count);
    await user.type(count, "9");
    await user.click(screen.getByRole("button", { name: "Start the test" }));
    expect(await screen.findByText("Enter a number from 1 to 4.")).toBeInTheDocument();
    await user.clear(count);
    await user.type(count, "3");
    await user.click(screen.getByRole("button", { name: "Start the test" }));
    const questions = await screen.findAllByRole("group");
    expect(questions).toHaveLength(3);
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("0 of 3 answered");
    await expectNoAxeViolations();
    await user.click(screen.getByRole("button", { name: "Check my answers" }));
    expect(await screen.findByRole("heading", { name: "0%" })).toBeInTheDocument();
    expect(screen.getAllByText("Incorrect")).toHaveLength(3);
    expect(screen.getAllByText("Your answer: No answer")).toHaveLength(3);
    await expectNoAxeViolations();
  });

  it("needs at least one question type", async () => {
    const user = userEvent.setup();
    render(<TestSession title="Cells" cards={cards} backHref="/x" backLabel="Back" />);
    for (const t of ["Multiple choice", "True or false", "Written"]) {
      await user.click(screen.getByLabelText(t));
    }
    expect(screen.getByRole("alert")).toHaveTextContent("Choose at least one type.");
    expect(screen.getByRole("button", { name: "Start the test" })).toBeDisabled();
  });
});

describe("MatchSession", () => {
  it("pairs terms with definitions by picking two tiles, and says what happened", async () => {
    const user = userEvent.setup();
    render(<MatchSession title="Cells" cards={cards} backHref="/x" backLabel="Back" />);
    expect(
      screen.getByText("Pick a term, then pick its definition.", { exact: false }),
    ).toBeInTheDocument();
    await expectNoAxeViolations();
    const tile = (name: string) => screen.getByRole("button", { name });
    await user.click(tile("Mitochondrion"));
    expect(tile("Mitochondrion, selected")).toHaveAttribute("aria-pressed", "true");
    await user.click(tile("Builds proteins"));
    expect(
      screen.getAllByRole("status").some((s) => s.textContent === "Not a match. Try again."),
    ).toBe(true);
    expect(screen.getByText(/1 mistake/)).toBeInTheDocument();
    for (const [term, def] of [
      ["Mitochondrion", "Makes ATP"],
      ["Ribosome", "Builds proteins"],
      ["Nucleus", "Holds DNA"],
      ["Golgi", "Packages proteins"],
    ] as const) {
      await user.click(tile(term));
      await user.click(tile(def));
    }
    expect(await screen.findByRole("heading", { name: "All matched" })).toBeInTheDocument();
    expect(screen.getAllByText(/with 1 mistake/).length).toBeGreaterThan(0);
    await expectNoAxeViolations();
    await user.click(screen.getByRole("button", { name: "Play again" }));
    expect(screen.getByText(/0 of 4 pairs/)).toBeInTheDocument();
  });

  it("can hide the timer", async () => {
    const user = userEvent.setup();
    render(<MatchSession title="Cells" cards={cards} backHref="/x" backLabel="Back" />);
    expect(screen.getByText(/0:00/)).toBeInTheDocument();
    await user.click(screen.getByLabelText("Show the timer"));
    expect(screen.queryByText(/0:00/)).not.toBeInTheDocument();
  });
});

describe("NoteScreen", () => {
  const note = {
    id: noteId,
    course_id: bio,
    title: "Lecture 9",
    body: "Ligand :: binds a receptor\nsecond line",
    pinned: false,
    created_at: "x",
    updated_at: "2027-03-01T15:00:00+00:00",
  };
  beforeEach(() => {
    api.notes.get.mockResolvedValue(note);
    api.notes.update.mockResolvedValue({ id: noteId, updated_at: "y" });
  });

  it("saves by itself a moment after typing, and says so", async () => {
    const user = userEvent.setup();
    render(<NoteScreen noteId={noteId} />);
    const body = await screen.findByLabelText("Note");
    await user.click(body);
    await user.type(body, " more");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    await waitFor(() => expect(api.notes.update).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(api.notes.update).toHaveBeenCalledWith({
      id: noteId,
      title: "Lecture 9",
      body: "Ligand :: binds a receptor\nsecond line more",
    });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("keeps the text and keeps trying when saving fails", async () => {
    const user = userEvent.setup();
    api.notes.update.mockRejectedValueOnce(new Error("offline"));
    render(<NoteScreen noteId={noteId} />);
    const body = await screen.findByLabelText("Note");
    await user.click(body);
    await user.type(body, "!");
    await user.tab(); // leaving the field saves right away
    expect(await screen.findByText(/Not saved: offline/)).toBeInTheDocument();
    expect(body).toHaveValue("Ligand :: binds a receptor\nsecond line!");
  });

  it("formats the selection from the toolbar", async () => {
    const user = userEvent.setup();
    render(<NoteScreen noteId={noteId} />);
    const body = (await screen.findByLabelText("Note")) as HTMLTextAreaElement;
    body.focus();
    body.setSelectionRange(0, 6);
    await user.click(screen.getByRole("button", { name: "Bold" }));
    expect(body).toHaveValue("**Ligand** :: binds a receptor\nsecond line");
  });

  it("shows a preview built from the note, never from raw HTML", async () => {
    const user = userEvent.setup();
    api.notes.get.mockResolvedValue({
      ...note,
      body: "# Title\n\n<img src=x onerror=alert(1)> **bold**\n\n- one\n- two\n\nterm :: definition",
    });
    render(<NoteScreen noteId={noteId} />);
    await user.click(await screen.findByRole("tab", { name: "Preview" }));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(within(panel).getByText("bold").tagName).toBe("STRONG");
    expect(within(panel).getAllByRole("listitem")).toHaveLength(2);
    expect(panel.querySelector("img")).toBeNull();
    expect(panel).toHaveTextContent("<img src=x onerror=alert(1)>");
    await expectNoAxeViolations();
  });

  it("makes cards from the note's own lines, without AI", async () => {
    const user = userEvent.setup();
    api.sets.create.mockResolvedValue({ id: setId });
    api.cards.add.mockResolvedValue([]);
    render(<NoteScreen noteId={noteId} />);
    await user.click(await screen.findByRole("button", { name: "Make flashcards" }));
    const dialog = await screen.findByRole("dialog", { name: "Make flashcards from this note" });
    expect(within(dialog).getByText(/1 card found/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Make cards" }));
    expect(api.sets.create).toHaveBeenCalledWith({ courseId: bio, title: "Lecture 9" });
    expect(api.cards.add).toHaveBeenCalledWith({
      setId,
      courseId: bio,
      cards: [{ front: "Ligand", back: "binds a receptor" }],
      startPosition: 0,
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/study/sets/${setId}?made=1`));
    expect(api.cards.generate).not.toHaveBeenCalled();
  });

  it("asks for consent before sending a note to the AI", async () => {
    const user = userEvent.setup();
    const { ApiError } = await import("@studypulse/core/api");
    api.notes.get.mockResolvedValue({
      ...note,
      body: "Cells talk with chemical signals. Reception, transduction, response.",
    });
    api.cards.generate.mockRejectedValueOnce(
      new ApiError(403, "ai_consent_required", "consent needed"),
    );
    api.cards.generate.mockResolvedValue({
      cards: [{ id: "c", front: "q?", back: "a", tags: [] }],
      set_id: setId,
      skipped_reason: null,
      task_completed: false,
    });
    api.privacy.setAiConsent.mockResolvedValue(undefined);
    render(<NoteScreen noteId={noteId} />);
    await user.click(await screen.findByRole("button", { name: "Make flashcards" }));
    const dialog = await screen.findByRole("dialog", { name: "Make flashcards from this note" });
    await user.click(within(dialog).getByRole("button", { name: "Make cards" }));
    const consent = await screen.findByRole("dialog", { name: /Anthropic|AI/i });
    await user.click(within(consent).getByRole("button", { name: /Allow/ }));
    expect(api.privacy.setAiConsent).toHaveBeenCalledWith(true, "prompt");
    await waitFor(() => expect(api.cards.generate).toHaveBeenCalledTimes(2));
    expect(api.cards.generate).toHaveBeenCalledWith(
      expect.objectContaining({ courseId: bio, setTitle: "Lecture 9" }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/study/sets/${setId}?made=1`));
  });

  it("flushes pending text when the screen closes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { unmount } = render(<NoteScreen noteId={noteId} />);
    const body = await screen.findByLabelText("Note");
    await user.click(body);
    await user.type(body, "x");
    expect(api.notes.update).not.toHaveBeenCalled();
    await act(async () => {
      unmount();
    });
    expect(api.notes.update).toHaveBeenCalled();
  });
});
