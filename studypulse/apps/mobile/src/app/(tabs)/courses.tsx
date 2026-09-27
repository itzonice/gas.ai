// Courses: one card per active course with its code, current grade against the target,
// and the next thing due (get_courses_overview). The primary action uploads a syllabus.
import { coursesOverviewSchema, type CourseCard } from "@studypulse/core/api";
import { dueText, formatPercent, targetStatus } from "@studypulse/core/screens";
import { courseSwatch } from "@studypulse/tokens/native";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { TabScreen } from "../../components/TabScreen";
import { CourseChip, EmptyState, Icon, OverflowMenu, useUndoDelete } from "../../components/ui";
import { useLoad, useWindowClass } from "../../lib/hooks";
import { cached } from "../../lib/offline";
import { getApi } from "../../lib/supabase";
import { useAppTheme } from "../../theme";

async function loadCourses() {
  const overview = await cached("courses.overview", coursesOverviewSchema, () =>
    getApi().courses.overview(),
  );
  return { overview, now: new Date() };
}

export default function CoursesScreen() {
  const theme = useAppTheme();
  const size = useWindowClass();
  const { data, error, refreshing, refresh, reload } = useLoad(loadCourses);
  const [failed, setFailed] = useState<string | null>(null);
  const undo = useUndoDelete({
    onError: () => {
      setFailed("Couldn't delete that course. It's back in your list.");
    },
    onCommitted: () => void reload(),
    bottom: 56 + theme.spacing.related,
  });
  const upload = () => {
    router.push("/courses/upload");
  };

  const card = (c: CourseCard) => {
    const status = targetStatus(c.current_grade, c.target_grade);
    const grade =
      c.current_grade === null
        ? "No grades yet"
        : `${formatPercent(c.current_grade)}${c.letter ? ` · ${c.letter}` : ""}`;
    return (
      <View key={c.id} style={{ flexBasis: size === "compact" ? "100%" : "47%", flexGrow: 1 }}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={[
            c.code ?? c.name,
            c.code ? c.name : null,
            `Current grade ${grade}`,
            status?.text,
            c.next_due ? `Next: ${c.next_due.title}` : "Nothing due",
          ]
            .filter(Boolean)
            .join(", ")}
          onPress={() => {
            router.push(`/courses/${c.id}`);
          }}
          style={({ pressed }) => ({
            gap: theme.spacing.related,
            padding: theme.spacing.card,
            paddingRight: theme.layout.minTarget + theme.spacing.related,
            borderRadius: theme.radii.card,
            borderLeftWidth: theme.layout.courseStripe,
            borderLeftColor: courseSwatch(c.color, theme.name).stripe,
            backgroundColor: theme.colors.surfaceContainer,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
              gap: theme.spacing.related,
            }}
          >
            <CourseChip code={c.code ?? c.name} colorHex={c.color} />
            <Text style={[theme.type.cardTitle, { color: theme.colors.onSurface, flexShrink: 1 }]}>
              {c.name}
            </Text>
          </View>
          <Text style={[theme.type.sectionHeading, { color: theme.colors.onSurface }]}>
            {grade}
          </Text>
          {status ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.half }}>
              <Icon
                name={status.tone === "error" ? "warning-amber" : "check-circle-outline"}
                size={18}
                color={status.tone === "error" ? theme.colors.error : theme.colors.onSurfaceVariant}
              />
              <Text
                style={[
                  theme.type.labelLarge,
                  {
                    color:
                      status.tone === "error" ? theme.colors.error : theme.colors.onSurfaceVariant,
                  },
                ]}
              >
                {status.text}
              </Text>
            </View>
          ) : null}
          <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
            {c.next_due
              ? `Next: ${c.next_due.title} · ${dueText(c.next_due.due_at, data?.overview.timezone ?? "UTC", data?.now ?? new Date())}`
              : "Nothing due"}
          </Text>
        </Pressable>
        {/* Beside the card's link, not inside it. */}
        <View style={{ position: "absolute", top: theme.spacing.half, right: theme.spacing.half }}>
          <OverflowMenu
            label={`More actions for ${c.code ?? c.name}`}
            items={[
              {
                label: "Delete course",
                destructive: true,
                onSelect: () => {
                  undo.remove(
                    { id: c.id, label: `Deleted ${c.code ?? c.name} and its assignments.` },
                    () => getApi().courses.remove(c.id),
                  );
                },
              },
            ]}
          />
        </View>
      </View>
    );
  };

  const courses = (data?.overview.courses ?? []).filter((c) => !undo.hidden.has(c.id));
  return (
    <View style={{ flex: 1 }}>
      <TabScreen
        title="Courses"
        description="Your grades and what's next in each course."
        primaryAction={{ label: "Upload syllabus", onPress: upload }}
        loading={!data}
        error={error ?? failed}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
      >
        {courses.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.related }}>
            {courses.map(card)}
          </View>
        ) : (
          <EmptyState
            icon="school"
            title="No courses yet"
            body="Upload or paste a syllabus. StudyPulse finds the due dates and grade weights, and you check them before anything is saved."
            action={{ label: "Upload syllabus", onPress: upload }}
          />
        )}
      </TabScreen>
      {undo.bar}
    </View>
  );
}
