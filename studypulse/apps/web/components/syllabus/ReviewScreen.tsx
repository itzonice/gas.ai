"use client";

// "Review your schedule": the parsed course, grading categories, and every item, with
// low-confidence items first. Items open in the review drawer; "Save to calendar"
// commits the reviewed draft with commit_parsed_syllabus.
import { ApiError } from "@studypulse/core/api";
import {
  draftToPayload,
  needsReview,
  parseResultSchema,
  toReviewDraft,
  totalWeight,
  type DraftIssue,
  type ParseResult,
  type ReviewCategory,
  type ReviewDraft,
  type ReviewItem,
} from "@studypulse/core/syllabus";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useApi } from "@/components/auth/SessionProvider";
import {
  Button,
  EmptyState,
  Icon,
  MetricCard,
  MetricGrid,
  OverflowMenu,
  PageHeader,
  TextField,
} from "@/components/ui";

import { itemDateText, KIND_LABELS, meetingName, meetingText } from "./labels";
import { ParseProgress } from "./ParseProgress";
import { ReviewDrawer } from "./ReviewDrawer";
import styles from "./syllabus.module.css";
import { isParsing, useUpload, type UploadRow } from "./useUpload";

export function ReviewScreen({ uploadId }: { uploadId: string }) {
  const api = useApi();
  const upload = useUpload(api, uploadId);

  const frame = (body: React.ReactNode) => (
    <div className="sp-page">
      <div className={styles.content}>
        <PageHeader title="Review your schedule" />
        {body}
      </div>
    </div>
  );

  if (upload.status === "loading") {
    return frame(
      <p role="status" className={styles.note}>
        Loading…
      </p>,
    );
  }
  if (upload.status === "error") {
    return frame(
      <p role="alert" className={styles.alert}>
        <Icon name="warning" size={20} />
        {upload.message}
      </p>,
    );
  }
  const { row } = upload;
  if (isParsing(row)) return frame(<ParseProgress filename={row.original_filename} />);
  if (row.status === "failed") {
    return frame(
      <EmptyState
        icon="warning"
        title="We couldn't read that syllabus"
        action={{ label: "Try another file", href: "/courses/upload", icon: "upload" }}
      >
        {row.error ?? "Something went wrong while reading it."}
      </EmptyState>,
    );
  }
  if (row.status === "committed") {
    return frame(
      <EmptyState
        icon="check"
        title="Already saved"
        action={
          row.course_id
            ? { label: "Open course", href: `/courses/${row.course_id}` }
            : { label: "Go to courses", href: "/courses" }
        }
      >
        This syllabus is already on your calendar.
      </EmptyState>,
    );
  }
  const parsed = parseResultSchema.safeParse(row.parse_result);
  if (!parsed.success) {
    return frame(
      <EmptyState
        icon="warning"
        title="This parse can't be reviewed"
        action={{ label: "Upload it again", href: "/courses/upload", icon: "upload" }}
      >
        The saved result is in a format this version of StudyPulse doesn&apos;t understand.
      </EmptyState>,
    );
  }
  return <ReviewEditor row={row} result={parsed.data} />;
}

type Issues = {
  course: Partial<Record<string, string>>;
  items: Record<string, Partial<Record<string, string>>>;
  categories: Record<string, Partial<Record<string, string>>>;
  list: DraftIssue[];
};

const noIssues: Issues = { course: {}, items: {}, categories: {}, list: [] };

function groupIssues(list: DraftIssue[]): Issues {
  const out: Issues = { course: {}, items: {}, categories: {}, list };
  for (const issue of list) {
    const field = issue.path.split(".").pop() ?? "";
    if (issue.itemKey) (out.items[issue.itemKey] ??= {})[field] ??= issue.message;
    else if (issue.categoryKey) (out.categories[issue.categoryKey] ??= {})[field] ??= issue.message;
    else if (issue.path.startsWith("course.")) out.course[field] ??= issue.message;
  }
  return out;
}

function ReviewEditor({ row, result }: { row: UploadRow; result: ParseResult }) {
  const api = useApi();
  const router = useRouter();
  const [draft, setDraft] = useState<ReviewDraft>(() => toReviewDraft(result));
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [issues, setIssues] = useState<Issues>(noIssues);
  const [error, setError] = useState<{ text: string; upgrade?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const alertRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (error) alertRef.current?.focus();
  }, [error]);

  const included = draft.items.filter((i) => !i.excluded);
  const toReview = draft.items.filter(needsReview);
  const openItem = draft.items.find((i) => i.key === openKey) ?? null;
  const weight = totalWeight(draft.categories);

  function patchItem(key: string, patch: Partial<ReviewItem>) {
    setDraft((d) => ({
      ...d,
      items: d.items.map((i) => (i.key === key ? { ...i, ...patch } : i)),
    }));
  }

  function patchCategory(key: string, patch: Partial<ReviewCategory>) {
    setDraft((d) => {
      const old = d.categories.find((c) => c.key === key);
      const renamed = old && patch.name !== undefined && patch.name !== old.name;
      return {
        ...d,
        categories: d.categories.map((c) => (c.key === key ? { ...c, ...patch } : c)),
        // Items follow their category when it is renamed.
        items: renamed
          ? d.items.map((i) =>
              i.category_name === old.name ? { ...i, category_name: patch.name ?? null } : i,
            )
          : d.items,
      };
    });
  }

  function removeCategory(key: string) {
    setDraft((d) => {
      const old = d.categories.find((c) => c.key === key);
      return {
        ...d,
        categories: d.categories.filter((c) => c.key !== key),
        items: d.items.map((i) =>
          old && i.category_name === old.name ? { ...i, category_name: null } : i,
        ),
      };
    });
    setMessage("Category removed.");
  }

  function addCategory() {
    setDraft((d) => ({
      ...d,
      categories: [
        ...d.categories,
        { key: `new-${Date.now()}`, name: "", weight: null, drop_lowest: null },
      ],
    }));
  }

  function openDrawer(key: string) {
    openerRef.current = document.activeElement as HTMLElement | null;
    setOpenKey(key);
  }

  function closeDrawer() {
    setOpenKey(null);
    // Return focus to whatever opened the drawer.
    requestAnimationFrame(() => openerRef.current?.focus());
  }

  function confirm(key: string) {
    patchItem(key, { checked: true });
    const item = draft.items.find((i) => i.key === key);
    setMessage(item ? `${item.title} marked as checked.` : "");
  }

  function toggleExcluded(item: ReviewItem) {
    patchItem(item.key, { excluded: !item.excluded });
    setMessage(
      item.excluded ? `${item.title} added back.` : `${item.title} left out of the schedule.`,
    );
  }

  async function save() {
    setError(null);
    const out = draftToPayload(draft);
    if (!out.ok) {
      setIssues(groupIssues(out.issues));
      setError({
        text:
          out.issues.length === 1
            ? "Fix 1 problem before saving."
            : `Fix ${out.issues.length} problems before saving.`,
      });
      return;
    }
    setIssues(noIssues);
    setSaving(true);
    try {
      const courseId = await api.syllabus.commit(row.id, out.payload);
      router.push(`/courses/${courseId}`);
    } catch (e) {
      setSaving(false);
      if (e instanceof ApiError && e.code === "course_limit_reached") {
        setError({ text: e.message, upgrade: true });
      } else {
        setError({ text: e instanceof Error ? e.message : "Couldn't save. Try again." });
      }
    }
  }

  const describeIssue = (issue: DraftIssue) => {
    const item = issue.itemKey ? draft.items.find((i) => i.key === issue.itemKey) : undefined;
    if (item) return `${item.title.trim() || "Untitled item"}: ${issue.message}`;
    const cat = issue.categoryKey
      ? draft.categories.find((c) => c.key === issue.categoryKey)
      : undefined;
    if (issue.categoryKey) return `Category ${cat?.name.trim() || "(unnamed)"}: ${issue.message}`;
    return issue.message;
  };

  return (
    <div className="sp-page">
      <div className={styles.content}>
        <PageHeader
          title="Review your schedule"
          description={`Check what we found in ${row.original_filename ?? "your syllabus"} before it goes on your calendar.`}
          primaryAction={{
            label: saving ? "Saving…" : "Save to calendar",
            icon: "calendar",
            onClick: () => void save(),
          }}
          secondaryActions={[{ label: "Upload a different syllabus", href: "/courses/upload" }]}
        />

        <div ref={alertRef} tabIndex={-1} className={styles.alertSlot}>
          {error ? (
            <div role="alert" className={styles.alert}>
              <Icon name="warning" size={20} />
              <span>
                {error.text}{" "}
                {error.upgrade ? <Link href="/settings/upgrade">See Pro plans</Link> : null}
              </span>
              {issues.list.length > 0 ? (
                <ul className={styles.issueList}>
                  {issues.list.map((issue) => (
                    <li key={`${issue.path}-${issue.message}`}>
                      {issue.itemKey ? (
                        <Button
                          variant="text"
                          onClick={() => {
                            if (issue.itemKey) openDrawer(issue.itemKey);
                          }}
                        >
                          {describeIssue(issue)}
                        </Button>
                      ) : (
                        describeIssue(issue)
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <MetricGrid label="Summary">
          <MetricCard
            label="Items found"
            value={included.length}
            detail={
              draft.items.length > included.length
                ? `${draft.items.length - included.length} left out`
                : "All will be added"
            }
          />
          <MetricCard
            label="Items needing review"
            value={toReview.length}
            detail={toReview.length ? "Listed first and marked “Needs review”" : "All checked"}
          />
        </MetricGrid>

        <section className={styles.section} aria-labelledby="course-heading">
          <h2 id="course-heading" className={styles.sectionHeading}>
            Course
          </h2>
          <div className={styles.fieldGrid}>
            <TextField
              label="Course name"
              required
              value={draft.course.name}
              error={issues.course.name ?? null}
              onChange={(e) => {
                const name = e.currentTarget.value;
                setDraft((d) => ({ ...d, course: { ...d.course, name } }));
              }}
            />
            <TextField
              label="Course code"
              placeholder="e.g. BIO 201"
              value={draft.course.code}
              error={issues.course.code ?? null}
              onChange={(e) => {
                const code = e.currentTarget.value;
                setDraft((d) => ({ ...d, course: { ...d.course, code } }));
              }}
            />
            <TextField
              label="Instructor"
              value={draft.course.instructor}
              onChange={(e) => {
                const instructor = e.currentTarget.value;
                setDraft((d) => ({ ...d, course: { ...d.course, instructor } }));
              }}
            />
            <TextField
              label="Term starts"
              type="date"
              value={draft.course.term_start}
              onChange={(e) => {
                const term_start = e.currentTarget.value;
                setDraft((d) => ({ ...d, course: { ...d.course, term_start } }));
              }}
            />
            <TextField
              label="Term ends"
              type="date"
              value={draft.course.term_end}
              error={issues.course.term_end ?? null}
              onChange={(e) => {
                const term_end = e.currentTarget.value;
                setDraft((d) => ({ ...d, course: { ...d.course, term_end } }));
              }}
            />
          </div>
        </section>

        <section className={styles.section} aria-labelledby="grading-heading">
          <h2 id="grading-heading" className={styles.sectionHeading}>
            Grading
          </h2>
          {draft.categories.length > 0 ? (
            <ul className={styles.categoryList} aria-label="Grade categories">
              {draft.categories.map((c, index) => {
                const errs = issues.categories[c.key] ?? {};
                const label = c.name.trim() || `category ${index + 1}`;
                return (
                  <li key={c.key} className={styles.categoryRow}>
                    <TextField
                      label="Category"
                      value={c.name}
                      error={errs.name ?? null}
                      onChange={(e) => {
                        patchCategory(c.key, { name: e.currentTarget.value });
                      }}
                    />
                    <TextField
                      label="Weight (%)"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      step="any"
                      value={c.weight ?? ""}
                      error={errs.weight ?? null}
                      onChange={(e) => {
                        const v = e.currentTarget.value;
                        patchCategory(c.key, { weight: v === "" ? null : Number(v) });
                      }}
                    />
                    <TextField
                      label="Drop lowest"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={20}
                      step={1}
                      value={c.drop_lowest ?? ""}
                      error={errs.drop_lowest ?? null}
                      onChange={(e) => {
                        const v = e.currentTarget.value;
                        patchCategory(c.key, { drop_lowest: v === "" ? null : Number(v) });
                      }}
                    />
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={`Remove ${label}`}
                      onClick={() => {
                        removeCategory(c.key);
                      }}
                    >
                      <Icon name="delete" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={styles.note}>
              No grade categories found. Grades will be averaged across everything.
            </p>
          )}
          <div className={styles.weightTotal}>
            {draft.categories.length > 0 ? (
              weight === 100 ? (
                <span className={styles.note}>Weights add up to 100%.</span>
              ) : (
                <span className={styles.warn}>
                  <Icon name="warning" size={18} />
                  Weights add up to {Math.round(weight * 100) / 100}%, not 100%.
                </span>
              )
            ) : null}
            <Button variant="tonal" icon="add" onClick={addCategory}>
              Add category
            </Button>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="meetings-heading">
          <h2 id="meetings-heading" className={styles.sectionHeading}>
            Class meetings
          </h2>
          <p className={styles.note}>
            After each class, StudyPulse adds a 20-minute task to make 5–20 cards, due within a day.
          </p>
          {draft.meetings.length > 0 ? (
            <ul className={styles.categoryList} aria-label="Class meetings">
              {draft.meetings.map((m, index) => (
                <li key={`${m.weekday}-${m.start_time}-${m.kind}`} className={styles.meetingRow}>
                  <span>{meetingText(m)}</span>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={`Remove ${meetingName(m)}`}
                    onClick={() => {
                      setDraft((d) => ({
                        ...d,
                        meetings: d.meetings.filter((_, i) => i !== index),
                      }));
                      setMessage(`${meetingName(m)} removed.`);
                    }}
                  >
                    <Icon name="delete" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.note}>No class times found in this syllabus.</p>
          )}
        </section>

        <section className={styles.section} aria-labelledby="items-heading">
          <h2 id="items-heading" className={styles.sectionHeading}>
            Assignments and exams
          </h2>
          <p className={styles.note}>
            Items we weren&apos;t sure about come first. Select one to edit it.
          </p>
          {draft.items.length > 0 ? (
            <ul className={styles.itemList} aria-label="Parsed items, needing review first">
              {draft.items.map((item) => {
                const flagged = needsReview(item);
                const errs = issues.items[item.key];
                return (
                  <li
                    key={item.key}
                    className={[
                      styles.item,
                      flagged ? styles.itemFlagged : "",
                      item.excluded ? styles.itemExcluded : "",
                    ].join(" ")}
                  >
                    <label className={styles.checkboxTarget}>
                      <input
                        type="checkbox"
                        checked={!item.excluded}
                        onChange={() => {
                          toggleExcluded(item);
                        }}
                      />
                      <span className="sp-visually-hidden">Include {item.title} in schedule</span>
                    </label>
                    <button
                      type="button"
                      className={styles.itemButton}
                      aria-haspopup="dialog"
                      onClick={() => {
                        openDrawer(item.key);
                      }}
                    >
                      <span className={styles.itemTitle}>
                        {item.title.trim() || "Untitled item"}
                      </span>
                      <span className={styles.itemMeta}>
                        {KIND_LABELS[item.kind]} · {itemDateText(item)} ·{" "}
                        {item.category_name ?? "No category"}
                        {item.points_possible ? ` · ${item.points_possible} pts` : ""}
                        {item.excluded ? " · Not in schedule" : ""}
                      </span>
                      {flagged ? (
                        <span className={styles.flag}>
                          <Icon name="warning" size={16} />
                          Needs review: {item.reasons[0] ?? "Check this item"}
                        </span>
                      ) : item.checked ? (
                        <span className={styles.checked}>
                          <Icon name="check" size={16} />
                          Checked
                        </span>
                      ) : null}
                      {errs ? (
                        <span className={styles.fieldError}>
                          <Icon name="warning" size={16} />
                          {Object.values(errs).join(" ")}
                        </span>
                      ) : null}
                    </button>
                    <OverflowMenu
                      label={`More actions for ${item.title}`}
                      items={[
                        {
                          label: "Edit",
                          onSelect: () => {
                            openDrawer(item.key);
                          },
                        },
                        ...(flagged
                          ? [
                              {
                                label: "Mark as checked",
                                onSelect: () => {
                                  confirm(item.key);
                                },
                              },
                            ]
                          : []),
                        {
                          label: item.excluded ? "Add back to schedule" : "Leave out of schedule",
                          onSelect: () => {
                            toggleExcluded(item);
                          },
                          destructive: !item.excluded,
                        },
                      ]}
                    />
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState headingLevel={3} title="No dated items found">
              You can still save the course and add assignments yourself.
            </EmptyState>
          )}
        </section>

        <p role="status" className="sp-visually-hidden">
          {message}
        </p>
      </div>

      <aside className={styles.panel} aria-labelledby="source-heading">
        <h2 id="source-heading" className={styles.panelTitle}>
          Original syllabus
        </h2>
        {row.extracted_text ? (
          <pre
            className={styles.sourceText}
            tabIndex={0}
            role="region"
            aria-label="Original syllabus text"
          >
            {row.extracted_text}
          </pre>
        ) : (
          <p className={styles.note}>
            {row.source_url ?? row.original_filename ?? "The original text isn't available."}
          </p>
        )}
      </aside>

      <ReviewDrawer
        item={openItem}
        categories={draft.categories}
        errors={openItem ? (issues.items[openItem.key] ?? {}) : {}}
        onChange={(patch) => {
          if (openItem) patchItem(openItem.key, patch);
        }}
        onConfirm={() => {
          if (openItem) confirm(openItem.key);
          closeDrawer();
        }}
        onToggleExcluded={() => {
          if (openItem) toggleExcluded(openItem);
        }}
        onClose={closeDrawer}
      />
    </div>
  );
}
