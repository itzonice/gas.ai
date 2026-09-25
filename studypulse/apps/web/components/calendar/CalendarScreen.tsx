"use client";

// Calendar: a month or week grid (from 600 px) with full keyboard support, a day-by-day
// agenda on phones, and the selected day's details in the right panel. Items and their
// local dates come from get_calendar; this component only lays them out.
import type { CalendarItem, CalendarRange } from "@studypulse/core/api";
import type { IsoDate } from "@studypulse/core/time";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { useApi } from "@/components/auth/SessionProvider";
import { Button, CourseChip, courseVars, Icon, PageHeader } from "@/components/ui";

import { AddAssignmentDialog } from "./AddAssignmentDialog";
import styles from "./calendar.module.css";
import {
  dayLabel,
  daySummary,
  groupByDate,
  itemTime,
  monthGrid,
  moveFocus,
  rangeFor,
  rangeLabel,
  step,
  weekDates,
  WEEKDAYS,
  WEEKDAYS_LONG,
  type CalendarView,
} from "./model";

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: CalendarRange };

/** The browser's date: a first guess until the server says what "today" is for the user. */
function browserToday(): IsoDate {
  const d = new Date();
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function CalendarScreen() {
  const api = useApi();
  const [view, setView] = useState<CalendarView>("month");
  const [selected, setSelected] = useState<IsoDate | null>(null);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [addOpen, setAddOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const focusAfterRender = useRef(false);
  const gridRef = useRef<HTMLTableElement>(null);

  const anchor = selected ?? browserToday();
  const { from, to } = rangeFor(view, anchor);

  useEffect(() => {
    let cancelled = false;
    api.calendar.range({ from, to }).then(
      (data) => {
        if (cancelled) return;
        setLoad({ status: "ready", data });
        setSelected((s) => s ?? data.today);
      },
      (error: unknown) => {
        if (cancelled) return;
        setLoad({
          status: "error",
          message: error instanceof Error ? error.message : "Something went wrong.",
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, from, to, reloadKey]);

  // Keyboard moves keep focus on the newly selected day (after any reload).
  useEffect(() => {
    if (!focusAfterRender.current || !selected) return;
    const cell = gridRef.current?.querySelector<HTMLElement>(`[data-date="${selected}"]`);
    if (cell) {
      cell.focus();
      focusAfterRender.current = false;
    }
  }, [selected, load]);

  const data = load.status === "ready" ? load.data : null;
  const byDate = useMemo(() => groupByDate(data?.items ?? []), [data]);
  const courses = useMemo(() => new Map((data?.courses ?? []).map((c) => [c.id, c])), [data]);
  const today = data?.today ?? browserToday();
  const tz = data?.timezone ?? "UTC";
  const weeks = view === "month" ? monthGrid(anchor) : [weekDates(anchor)];
  const month = anchor.slice(0, 7);

  const select = useCallback((date: IsoDate, focus = false) => {
    focusAfterRender.current = focus;
    setSelected(date);
  }, []);

  function onGridKeyDown(event: KeyboardEvent<HTMLTableElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      return;
    }
    const next = moveFocus(anchor, event.key, view);
    if (!next) return;
    event.preventDefault();
    select(next, true);
  }

  const courseOf = (id: string) => {
    const c = courses.get(id);
    return { code: c?.code ?? "Course", colorHex: c?.color ?? null };
  };
  const unit = view === "month" ? "month" : "week";
  const selectedItems = byDate.get(anchor) ?? [];

  const itemRow = (item: CalendarItem) => {
    const course = courseOf(item.course_id);
    const done = item.status === "done";
    return (
      <li
        key={`${item.type}-${item.id}`}
        className={styles.item}
        style={{ ["--stripe" as string]: courseVars(course.colorHex).stripe }}
      >
        <span className={[styles.itemTitle, done ? styles.done : ""].join(" ")}>
          {item.type === "due" ? (
            <Link href={`/courses/${item.course_id}?assignment=${item.id}`}>{item.title}</Link>
          ) : (
            item.title
          )}
        </span>
        <span className={styles.itemMeta}>
          <CourseChip {...course} />
          <span>{itemTime(item, tz)}</span>
          {item.overdue ? (
            <span className={styles.overdue}>
              <Icon name="warning" size={16} />
              Overdue
            </span>
          ) : null}
          {done ? <span>Done</span> : null}
        </span>
      </li>
    );
  };

  return (
    <div className="sp-page">
      <div className={styles.content}>
        <PageHeader
          title="Calendar"
          description="Deadlines and study time, in your time zone."
          primaryAction={{
            label: "Add assignment",
            icon: "add",
            onClick: () => {
              setAddOpen(true);
            },
          }}
          secondaryActions={[
            { label: "Subscribe from another calendar app", href: "/settings#calendar-feed" },
            { label: "Connect Google Calendar", href: "/settings/integrations" },
          ]}
        />

        <div className={styles.toolbar}>
          <div className={styles.rangeNav}>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={`Previous ${unit}`}
              onClick={() => {
                select(step(view, anchor, -1));
              }}
            >
              <Icon name="chevronLeft" />
            </button>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={`Next ${unit}`}
              onClick={() => {
                select(step(view, anchor, 1));
              }}
            >
              <Icon name="chevronRight" />
            </button>
            <Button
              variant="text"
              onClick={() => {
                select(today);
              }}
            >
              Today
            </Button>
          </div>
          <h2 id="range-label" className={styles.rangeLabel} aria-live="polite">
            {rangeLabel(view, anchor)}
          </h2>
          <div className={styles.viewSwitch} role="group" aria-label="View">
            {(["month", "week"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => {
                  setView(v);
                }}
              >
                {v === "month" ? "Month" : "Week"}
              </button>
            ))}
          </div>
        </div>

        {load.status === "error" ? (
          <p role="alert" className={styles.alert}>
            <Icon name="warning" size={20} />
            Couldn&apos;t load the calendar: {load.message}
            <Button
              variant="text"
              onClick={() => {
                setLoad({ status: "loading" });
                setReloadKey((k) => k + 1);
              }}
            >
              Try again
            </Button>
          </p>
        ) : null}
        {load.status === "loading" ? (
          <p role="status" className={styles.muted}>
            Loading…
          </p>
        ) : null}

        <table
          ref={gridRef}
          className={styles.grid}
          role="grid"
          aria-labelledby="range-label"
          aria-describedby="grid-help"
          onKeyDown={onGridKeyDown}
        >
          <thead>
            <tr>
              {WEEKDAYS.map((d, i) => (
                <th key={d} scope="col" abbr={WEEKDAYS_LONG[i]}>
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week[0]}>
                {week.map((date) => {
                  const items = byDate.get(date) ?? [];
                  const isSelected = date === anchor;
                  const shown = view === "month" ? items.slice(0, 3) : items;
                  return (
                    <td
                      key={date}
                      role="gridcell"
                      data-date={date}
                      tabIndex={isSelected ? 0 : -1}
                      aria-selected={isSelected}
                      className={[
                        styles.cell,
                        view === "week" ? styles.weekCell : "",
                        view === "month" && date.slice(0, 7) !== month ? styles.outside : "",
                        date === today ? styles.today : "",
                      ].join(" ")}
                      onClick={() => {
                        select(date);
                      }}
                    >
                      <span className="sp-visually-hidden">
                        {dayLabel(date)}
                        {date === today ? ", today" : ""}. {daySummary(items)}.
                      </span>
                      <span aria-hidden="true">
                        <span className={styles.dayNumber}>{Number(date.slice(8))}</span>
                        {shown.length ? (
                          <ul className={styles.chips}>
                            {shown.map((item) => {
                              const course = courseOf(item.course_id);
                              return (
                                <li
                                  key={`${item.type}-${item.id}`}
                                  className={[
                                    styles.chip,
                                    item.overdue ? styles.chipOverdue : "",
                                  ].join(" ")}
                                  style={{
                                    ["--stripe" as string]: courseVars(course.colorHex).stripe,
                                  }}
                                >
                                  <span>
                                    {course.code} · {item.overdue ? "Overdue: " : ""}
                                    {item.title}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                        {items.length > shown.length ? (
                          <span className={styles.more}>+{items.length - shown.length} more</span>
                        ) : null}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p id="grid-help" className="sp-visually-hidden">
          Arrow keys move between days, Home and End go to the start and end of the week, Page Up
          and Page Down change the {unit}.
        </p>

        <section className={styles.agenda} aria-labelledby="agenda-heading">
          <h2 id="agenda-heading" className="sp-visually-hidden">
            Agenda
          </h2>
          {data && data.items.length === 0 ? (
            <p className={styles.muted}>Nothing scheduled in {rangeLabel(view, anchor)}.</p>
          ) : null}
          {[...byDate.keys()]
            .filter((date) => date >= from && date <= to)
            .sort()
            .map((date) => (
              <section key={date} className={styles.agendaDay} aria-labelledby={`agenda-${date}`}>
                <h3 id={`agenda-${date}`} className={styles.agendaHeading}>
                  {dayLabel(date)}
                  {date === today ? " (today)" : ""}
                </h3>
                <ul className={styles.itemList}>{(byDate.get(date) ?? []).map(itemRow)}</ul>
              </section>
            ))}
        </section>

        <p role="status" className="sp-visually-hidden">
          {message}
        </p>
      </div>

      <aside className={styles.panel} aria-labelledby="day-heading">
        <h2 id="day-heading" className={styles.panelTitle}>
          {dayLabel(anchor)}
          {anchor === today ? " (today)" : ""}
        </h2>
        {selectedItems.length ? (
          <ul className={styles.itemList}>{selectedItems.map(itemRow)}</ul>
        ) : (
          <p className={styles.muted}>Nothing scheduled.</p>
        )}
        <Button
          variant="tonal"
          icon="add"
          onClick={() => {
            setAddOpen(true);
          }}
        >
          Add assignment on this day
        </Button>
      </aside>

      <AddAssignmentDialog
        open={addOpen}
        date={anchor}
        timezone={tz}
        courses={data?.courses ?? []}
        onClose={() => {
          setAddOpen(false);
        }}
        onAdded={(title) => {
          setAddOpen(false);
          setMessage(`${title} added.`);
          setReloadKey((k) => k + 1);
        }}
      />
    </div>
  );
}
