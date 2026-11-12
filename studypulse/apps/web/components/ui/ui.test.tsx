import { coursePalette } from "@studypulse/tokens";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CourseChip } from "./CourseChip";
import { EmptyState } from "./EmptyState";
import { MetricCard, MetricGrid } from "./MetricCard";
import { OverflowMenu } from "./OverflowMenu";
import { PageHeader } from "./PageHeader";
import { TaskList, TaskRow } from "./TaskRow";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("OverflowMenu", () => {
  const setup = () => {
    const rename = vi.fn();
    const remove = vi.fn();
    render(
      <OverflowMenu
        label="More actions for Lab 1"
        items={[
          { label: "Rename", onSelect: rename },
          { label: "Open course", href: "/courses/1" },
          { label: "Delete", onSelect: remove, destructive: true },
        ]}
      />,
    );
    return {
      rename,
      remove,
      button: screen.getByRole("button", { name: "More actions for Lab 1" }),
    };
  };

  it("is a named menu button, closed until opened", () => {
    const { button } = setup();
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens with Enter on the first item, arrows wrap, Home/End jump", async () => {
    const user = userEvent.setup();
    const { button } = setup();
    button.focus();
    await user.keyboard("{Enter}");
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "Rename" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Open course" })).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Rename" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("menuitem", { name: "Rename" })).toHaveFocus();
  });

  it("ArrowUp opens on the last item", async () => {
    const user = userEvent.setup();
    const { button } = setup();
    button.focus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
  });

  it("Escape closes and returns focus to the button", async () => {
    const user = userEvent.setup();
    const { button } = setup();
    button.focus();
    await user.keyboard("{Enter}{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it("selecting an item runs it and closes the menu", async () => {
    const user = userEvent.setup();
    const { button, remove } = setup();
    await user.click(button);
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(remove).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("a click outside closes it", async () => {
    const user = userEvent.setup();
    const { button } = setup();
    await user.click(button);
    await user.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("TaskRow", () => {
  const renderRow = (props: Partial<React.ComponentProps<typeof TaskRow>> = {}) => {
    const onToggleDone = vi.fn();
    render(
      <TaskList label="Tasks">
        <TaskRow
          id="a1"
          title="Lab 1"
          href="/assignments/a1"
          course={{ code: "BIO 201", colorHex: coursePalette[0]?.hex ?? null }}
          dueText="Due today at 5:00 PM"
          done={false}
          onToggleDone={onToggleDone}
          menuItems={[{ label: "Edit", href: "/assignments/a1/edit" }]}
          {...props}
        />
      </TaskList>,
    );
    return { onToggleDone };
  };

  it("keeps the checkbox and menu outside the row's link", () => {
    renderRow();
    const link = screen.getByRole("link", { name: /Lab 1/ });
    expect(within(link).queryByRole("checkbox")).toBeNull();
    expect(within(link).queryByRole("button")).toBeNull();
    expect(link).toHaveAttribute("href", "/assignments/a1");
  });

  it("names the checkbox after the task and reports changes", async () => {
    const user = userEvent.setup();
    const { onToggleDone } = renderRow();
    await user.click(screen.getByRole("checkbox", { name: "Mark Lab 1 done" }));
    expect(onToggleDone).toHaveBeenCalledWith(true);
  });

  it("shows the course code as text and 'Overdue' as words, not color alone", () => {
    renderRow({ overdue: true });
    const link = screen.getByRole("link", { name: /Lab 1/ });
    expect(within(link).getByText("BIO 201")).toBeInTheDocument();
    expect(within(link).getByText("Overdue")).toBeInTheDocument();
  });

  it("gives each row's menu a distinct name", () => {
    renderRow();
    expect(screen.getByRole("button", { name: "More actions for Lab 1" })).toBeInTheDocument();
  });
});

describe("PageHeader", () => {
  it("renders one H1, the description, the primary action, and an overflow menu", () => {
    render(
      <PageHeader
        title="Courses"
        description="Your courses, grades, and syllabi."
        primaryAction={{ label: "Upload syllabus", href: "/courses/upload", icon: "upload" }}
        secondaryActions={[{ label: "Archived courses", href: "/courses/archived" }]}
      />,
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Courses");
    expect(screen.getByRole("link", { name: "Upload syllabus" })).toHaveAttribute(
      "href",
      "/courses/upload",
    );
    expect(screen.getByRole("button", { name: "More actions" })).toBeInTheDocument();
  });
});

describe("MetricCard", () => {
  it("states status in words", () => {
    render(
      <MetricGrid label="This week">
        <MetricCard
          label="Courses at risk"
          value={1}
          status={{ tone: "error", text: "At risk: BIO 201" }}
        />
      </MetricGrid>,
    );
    expect(screen.getByRole("list", { name: "This week" })).toBeInTheDocument();
    expect(screen.getByText("At risk: BIO 201")).toBeInTheDocument();
  });
});

describe("CourseChip", () => {
  it("shows the code and uses themed palette variables", () => {
    render(<CourseChip code="CHEM 230" colorHex="#E53935" />);
    const chip = screen.getByText("CHEM 230");
    expect(chip.style.background).toBe("var(--sp-course-red-chip)");
    expect(chip.style.color).toBe("var(--sp-course-red-on-chip)");
  });
});

describe("EmptyState", () => {
  it("has a heading, an explanation, and one action", () => {
    render(
      <EmptyState
        title="No courses yet"
        action={{ label: "Upload a syllabus", href: "/courses/upload" }}
      >
        Upload a syllabus and StudyPulse builds your schedule.
      </EmptyState>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "No courses yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload a syllabus" })).toBeInTheDocument();
  });
});
