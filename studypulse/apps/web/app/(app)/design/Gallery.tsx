"use client";

import { coursePalette } from "@studypulse/tokens";
import { useState } from "react";

import {
  CourseChip,
  EmptyState,
  MetricCard,
  MetricGrid,
  PageHeader,
  TaskList,
  TaskRow,
} from "@/components/ui";

const hex = (key: string) => coursePalette.find((c) => c.key === key)?.hex ?? null;

export function Gallery() {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const tasks = [
    {
      id: "1",
      title: "Lab 3: Enzyme kinetics",
      code: "BIO 201",
      color: hex("green"),
      due: "Due yesterday at 11:59 PM",
      overdue: true,
      meta: "Worth 5%",
    },
    {
      id: "2",
      title: "Problem Set 5",
      code: "MATH 221",
      color: hex("blue"),
      due: "Due today at 5:00 PM",
      meta: "Worth 4% · ~90 min",
    },
    {
      id: "3",
      title: "Response 4: Decolonization",
      code: "HIST 110",
      color: hex("purple"),
      due: "Due Fri, Mar 5 at 11:59 PM",
      meta: "~45 min",
    },
  ];
  return (
    <div className="sp-page">
      <div style={{ display: "grid", gap: "var(--sp-space-section)" }}>
        <PageHeader
          title="Components"
          description="Shared building blocks, in the current theme."
          primaryAction={{ label: "Start focus", icon: "play", onClick: () => undefined }}
          secondaryActions={[
            { label: "Export", onSelect: () => undefined },
            { label: "Settings", href: "/settings" },
          ]}
        />
        <MetricGrid label="This week">
          <MetricCard label="Due this week" value={7} detail="3 due tomorrow" />
          <MetricCard label="Focus hours" value="6.5" detail="+1.2 vs last week" />
          <MetricCard
            label="Courses at risk"
            value={1}
            status={{ tone: "error", text: "At risk: BIO 201" }}
          />
        </MetricGrid>
        <section
          aria-labelledby="tasks-heading"
          style={{ display: "grid", gap: "var(--sp-space-related)" }}
        >
          <h2 id="tasks-heading" style={{ fontSize: "var(--sp-type-section-heading-size)" }}>
            Tasks
          </h2>
          <TaskList label="Tasks">
            {tasks.map((t) => (
              <TaskRow
                key={t.id}
                id={t.id}
                title={t.title}
                href={`/assignments/${t.id}`}
                course={{ code: t.code, colorHex: t.color }}
                dueText={t.due}
                overdue={Boolean(t.overdue)}
                meta={t.meta}
                done={Boolean(done[t.id])}
                onToggleDone={(v) => {
                  setDone((d) => ({ ...d, [t.id]: v }));
                }}
                menuItems={[
                  { label: "Edit", href: `/assignments/${t.id}/edit` },
                  { label: "Delete", onSelect: () => undefined, destructive: true },
                ]}
              />
            ))}
          </TaskList>
        </section>
        <section
          aria-labelledby="chips-heading"
          style={{ display: "grid", gap: "var(--sp-space-related)" }}
        >
          <h2 id="chips-heading" style={{ fontSize: "var(--sp-type-section-heading-size)" }}>
            Course palette
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-space-related)" }}>
            {coursePalette.map((c) => (
              <CourseChip key={c.key} code={`${c.label.toUpperCase()} 101`} colorHex={c.hex} />
            ))}
          </div>
        </section>
        <EmptyState
          title="No courses yet"
          action={{ label: "Upload a syllabus", href: "/courses", icon: "upload" }}
        >
          Upload a syllabus and StudyPulse builds your schedule, reminders, and grade tracking.
        </EmptyState>
      </div>
    </div>
  );
}
