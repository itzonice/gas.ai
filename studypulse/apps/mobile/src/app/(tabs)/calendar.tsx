// Calendar: a day-by-day agenda for one week (Monday to Sunday) from get_calendar, which
// already places every item on the student's local date. Previous, Next, and This week
// are buttons; swiping the agenda sideways is a shortcut for the same thing. Tablets show
// the days in two columns.
import { calendarRangeSchema, type CalendarItem } from "@studypulse/core/api";
import {
  dayLabel,
  daySummary,
  groupByDate,
  itemTime,
  rangeFor,
  rangeLabel,
  step,
  weekDates,
} from "@studypulse/core/screens";
import { courseSwatch } from "@studypulse/tokens/native";
import { localDate, type IsoDate } from "@studypulse/core/time";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ListCard, TabScreen } from "../../components/TabScreen";
import { CourseChip, Icon, useHorizontalSwipe } from "../../components/ui";
import { useLoad, useWindowClass } from "../../lib/hooks";
import { cached } from "../../lib/offline";
import { getApi } from "../../lib/supabase";
import { useAppTheme } from "../../theme";

const deviceToday = () =>
  localDate(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");

export default function CalendarScreen() {
  const theme = useAppTheme();
  const size = useWindowClass();
  const [anchor, setAnchor] = useState<IsoDate>(deviceToday);
  const range = useMemo(() => rangeFor("week", anchor), [anchor]);
  const fetcher = useCallback(
    () =>
      cached(`calendar.${range.from}`, calendarRangeSchema, () => getApi().calendar.range(range)),
    [range],
  );
  const { data, error, refreshing, refresh } = useLoad(fetcher);

  const previous = useCallback(() => {
    setAnchor((d) => step("week", d, -1));
  }, []);
  const next = useCallback(() => {
    setAnchor((d) => step("week", d, 1));
  }, []);
  const swipe = useHorizontalSwipe(previous, next);

  // Until the new week arrives, the old one stays on screen; never label it as the new one.
  const shown = data && data.from === range.from ? data : null;
  const courses = new Map(shown?.courses.map((c) => [c.id, c]) ?? []);
  const byDate = groupByDate(shown?.items ?? []);
  const days = weekDates(range.from);

  const nav = (
    label: string,
    icon: "chevron-left" | "chevron-right" | "today",
    onPress: () => void,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minWidth: 48,
        minHeight: 48,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: theme.spacing.half,
        paddingHorizontal: theme.spacing.related,
        borderRadius: theme.radii.full,
        backgroundColor: theme.colors.secondaryContainer,
      }}
    >
      <Icon name={icon} size={24} color={theme.colors.onSecondaryContainer} />
      {icon === "today" ? (
        <Text style={[theme.type.labelLarge, { color: theme.colors.onSecondaryContainer }]}>
          This week
        </Text>
      ) : null}
    </Pressable>
  );

  const itemRow = (item: CalendarItem, i: number) => {
    const course = courses.get(item.course_id);
    const done = item.status === "done";
    return (
      <Pressable
        key={`${item.type}-${item.id}`}
        accessibilityRole="link"
        accessibilityHint="Opens the course"
        onPress={() => {
          router.push(`/courses/${item.course_id}`);
        }}
        style={({ pressed }) => ({
          minHeight: 48,
          paddingVertical: 12,
          paddingHorizontal: theme.spacing.card,
          gap: 2,
          borderLeftWidth: theme.layout.courseStripe,
          borderLeftColor: courseSwatch(course?.color ?? null, theme.name).stripe,
          borderTopWidth: i === 0 ? 0 : 1,
          borderTopColor: theme.colors.outlineVariant,
          backgroundColor: theme.colors.surfaceContainerLow,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text
          style={[
            theme.type.cardTitle,
            {
              color: done ? theme.colors.onSurfaceVariant : theme.colors.onSurface,
              textDecorationLine: done ? "line-through" : "none",
            },
          ]}
        >
          {item.title}
        </Text>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: theme.spacing.related,
          }}
        >
          <CourseChip code={course?.code ?? "Course"} colorHex={course?.color ?? null} />
          <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
            {shown ? itemTime(item, shown.timezone) : ""}
            {done ? " · Done" : ""}
          </Text>
          {item.overdue && !done ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
              <Icon name="warning-amber" size={16} color={theme.colors.error} />
              <Text style={[theme.type.labelLarge, { color: theme.colors.error }]}>Overdue</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <TabScreen
      title="Calendar"
      description={rangeLabel("week", anchor)}
      primaryAction={{
        label: "Add assignment",
        onPress: () => {
          const today = shown?.today ?? deviceToday();
          const date = today >= range.from && today <= range.to ? today : range.from;
          router.push({ pathname: "/assignments/new", params: { date } });
        },
      }}
      loading={!data}
      error={error}
      refreshing={refreshing}
      onRefresh={() => void refresh()}
    >
      <View style={{ flexDirection: "row", gap: theme.layout.targetGap, flexWrap: "wrap" }}>
        {nav("Previous week", "chevron-left", previous)}
        {nav("Next week", "chevron-right", next)}
        {nav("This week", "today", () => {
          setAnchor(data?.today ?? deviceToday());
        })}
      </View>
      {!shown ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}
        >
          Loading this week…
        </Text>
      ) : (
        <View
          {...swipe}
          style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.section }}
        >
          {days.map((date) => {
            const items = byDate.get(date) ?? [];
            const isToday = date === shown.today;
            return (
              <View
                key={date}
                style={{
                  gap: theme.spacing.related,
                  flexBasis: size === "compact" ? "100%" : "47%",
                  flexGrow: 1,
                }}
              >
                <Text
                  accessibilityRole="header"
                  accessibilityLabel={`${dayLabel(date)}${isToday ? ", today" : ""}. ${daySummary(items)}`}
                  style={[
                    theme.type.cardTitle,
                    { color: isToday ? theme.colors.primary : theme.colors.onSurface },
                  ]}
                >
                  {dayLabel(date)}
                  {isToday ? " · Today" : ""}
                </Text>
                {items.length ? (
                  <ListCard label={dayLabel(date)}>{items.map(itemRow)}</ListCard>
                ) : (
                  <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
                    Nothing scheduled
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      )}
    </TabScreen>
  );
}
