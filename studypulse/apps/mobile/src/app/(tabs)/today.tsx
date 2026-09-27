// Today: this week's metrics, today's reviews first, then the ranked task list, and the
// next exam. Everything is computed on the server (get_today_overview, get_today_feed);
// this screen renders it and saves checkbox changes. Swipe right marks a row done and
// swipe left starts focus on it; both are also buttons (checkbox, overflow menu).
import type { TodayFeedRow } from "@studypulse/core/api";
import {
  atRiskStatus,
  dayLabel,
  dueText,
  examCountdown,
  focusHours,
  reviewMeta,
  taskMeta,
  timeRange,
} from "@studypulse/core/screens";
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { ListCard, SectionHeading, TabScreen } from "../../components/TabScreen";
import { EmptyState, MetricCard, MetricGrid, Notice, SwipeRow, TaskRow } from "../../components/ui";
import { announce, useLoad } from "../../lib/hooks";
import { getApi } from "../../lib/supabase";
import { useAppTheme } from "../../theme";

async function loadToday() {
  const api = getApi();
  const [overview, feed] = await Promise.all([api.today.overview(), api.today.feed()]);
  return { overview, feed, now: new Date() };
}

export default function TodayScreen() {
  const theme = useAppTheme();
  const { data, error, refreshing, refresh, reload } = useLoad(loadToday);
  // Checkbox changes show at once and roll back if the save fails.
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  function say(text: string, isError = false) {
    setMessage({ text, error: isError });
    announce(text);
  }

  async function toggle(row: TodayFeedRow, next: boolean) {
    setDone((s) => ({ ...s, [row.item_id]: next }));
    try {
      if (row.item_type === "review") {
        await getApi().plan.setBlockStatus({ id: row.item_id, status: next ? "done" : "planned" });
      } else {
        await getApi().assignments.update({ id: row.item_id, status: next ? "done" : "todo" });
      }
      say(next ? `${row.title} marked done.` : `${row.title} marked not done.`);
    } catch {
      setDone((s) => ({ ...s, [row.item_id]: !next }));
      say(`Couldn't update ${row.title}. Try again.`, true);
    }
  }

  async function rebuildPlan() {
    say("Rebuilding your study plan…");
    try {
      await getApi().plan.rebuild();
      await reload();
      say("Study plan rebuilt.");
    } catch {
      say("Couldn't rebuild your study plan. Try again.", true);
    }
  }

  const focusOn = (row: TodayFeedRow) => {
    router.push({
      pathname: "/focus",
      params: row.assignment_id
        ? { assignmentId: row.assignment_id, start: "1" }
        : { blockId: row.item_id, start: "1" },
    });
  };

  const overview = data?.overview;
  const feed = data?.feed ?? [];
  const courses = new Map(overview?.courses.map((c) => [c.id, c]) ?? []);
  const reviews = feed.filter((r) => r.item_type === "review");
  const tasks = feed.filter((r) => r.item_type === "task");
  const tz = overview?.timezone ?? "UTC";
  const now = data?.now ?? new Date();

  const isDone = (row: TodayFeedRow) =>
    done[row.item_id] ??
    (row.item_type === "review" ? row.block_status === "done" : row.status === "done");

  const row = (r: TodayFeedRow, i: number) => {
    const course = courses.get(r.course_id);
    const checked = isDone(r);
    const review = r.item_type === "review";
    return (
      <SwipeRow
        key={r.item_id}
        right={{
          label: checked ? "Mark not done" : "Mark done",
          icon: checked ? "undo" : "check",
          onAction: () => void toggle(r, !checked),
        }}
        left={{ label: "Start focus", icon: "play-arrow", onAction: () => focusOn(r) }}
      >
        <TaskRow
          isFirst={i === 0}
          title={r.title}
          course={{ code: course?.code ?? r.course_name, colorHex: course?.color ?? null }}
          done={checked}
          overdue={r.overdue && !checked}
          {...(review
            ? {
                dueText: r.starts_at && r.ends_at ? timeRange(r.starts_at, r.ends_at, tz) : "Today",
                meta: reviewMeta(r),
              }
            : { dueText: dueText(r.due_at, tz, now), meta: taskMeta(r) || undefined })}
          onToggleDone={(next) => void toggle(r, next)}
          onOpen={() => {
            router.push(`/courses/${r.course_id}`);
          }}
          menuItems={[
            { label: "Start focus on this", onSelect: () => focusOn(r) },
            {
              label: "Open course",
              onSelect: () => {
                router.push(`/courses/${r.course_id}`);
              },
            },
          ]}
        />
      </SwipeRow>
    );
  };

  return (
    <TabScreen
      title="Today"
      description={overview ? dayLabel(overview.today) : "What's due and what to do next."}
      primaryAction={{
        label: "Start focus",
        onPress: () => {
          router.push({ pathname: "/focus", params: { start: "1" } });
        },
      }}
      secondaryActions={[
        { label: "Rebuild study plan", onSelect: () => void rebuildPlan() },
        {
          label: "Upload syllabus",
          onSelect: () => {
            router.push("/courses/upload");
          },
        },
      ]}
      loading={!data}
      error={error}
      refreshing={refreshing}
      onRefresh={() => void refresh()}
    >
      {message ? <Notice tone={message.error ? "error" : "info"}>{message.text}</Notice> : null}
      {overview ? (
        <MetricGrid>
          <MetricCard label="Due this week" value={overview.due_this_week} />
          <MetricCard
            label="Focus this week"
            value={`${focusHours(overview.focus_minutes_this_week)} h`}
          />
          <MetricCard
            label="Courses at risk"
            value={overview.courses_at_risk.length}
            {...(atRiskStatus(overview.courses_at_risk)
              ? { status: atRiskStatus(overview.courses_at_risk) }
              : { detail: "All on track for your targets" })}
          />
        </MetricGrid>
      ) : null}

      {overview?.next_exam ? (
        <View
          accessible
          style={{
            gap: theme.spacing.half,
            padding: theme.spacing.card,
            borderRadius: theme.radii.card,
            backgroundColor: theme.colors.surfaceContainer,
          }}
        >
          <Text style={[theme.type.labelLarge, { color: theme.colors.onSurfaceVariant }]}>
            Next exam · {examCountdown(overview.next_exam.days_until)}
          </Text>
          <Text style={[theme.type.cardTitle, { color: theme.colors.onSurface }]}>
            {overview.next_exam.title}
          </Text>
          <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
            {dueText(overview.next_exam.due_at, tz, now)}
          </Text>
        </View>
      ) : null}

      {reviews.length ? (
        <View style={{ gap: theme.spacing.related }}>
          <SectionHeading>Reviews</SectionHeading>
          <ListCard label="Reviews">{reviews.map(row)}</ListCard>
        </View>
      ) : null}

      <View style={{ gap: theme.spacing.related }}>
        <SectionHeading>Tasks</SectionHeading>
        {tasks.length ? (
          <ListCard label="Tasks">{tasks.map(row)}</ListCard>
        ) : (
          <EmptyState
            icon="event-available"
            title={overview?.courses.length ? "Nothing else for today" : "No courses yet"}
            body={
              overview?.courses.length
                ? "You're clear for today. Pull down to refresh."
                : "Upload a syllabus and StudyPulse plans your week."
            }
            {...(overview?.courses.length
              ? {}
              : {
                  action: {
                    label: "Upload syllabus",
                    onPress: () => {
                      router.push("/courses/upload");
                    },
                  },
                })}
          />
        )}
      </View>
    </TabScreen>
  );
}
