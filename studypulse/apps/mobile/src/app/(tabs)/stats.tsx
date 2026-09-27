// Stats: focus minutes against grade per course (get_stats_overview). Each course shows
// its numbers as text beside the bars, and a plain-language summary comes first, so
// nothing depends on reading the chart. Export shares the same numbers as CSV.
import {
  barWidth,
  belowTarget,
  courseLabel,
  formatMinutes,
  hours,
  percent,
  PERIOD_OPTIONS,
  statsCsv,
  summarize,
} from "@studypulse/core/screens";
import { courseSwatch } from "@studypulse/tokens/native";
import { useCallback, useState } from "react";
import { Share, Text, View } from "react-native";

import { ListCard, SectionHeading, TabScreen } from "../../components/TabScreen";
import { ChoiceChips, CourseChip, Icon, MetricCard, MetricGrid, Notice } from "../../components/ui";
import { useLoad } from "../../lib/hooks";
import { getApi } from "../../lib/supabase";
import { useAppTheme } from "../../theme";

export default function StatsScreen() {
  const theme = useAppTheme();
  const [weeks, setWeeks] = useState<number>(4);
  const fetcher = useCallback(() => getApi().stats.overview(weeks), [weeks]);
  const { data, error, refreshing, refresh } = useLoad(fetcher);
  const [exportError, setExportError] = useState<string | null>(null);

  async function exportCsv() {
    if (!data) return;
    setExportError(null);
    try {
      await Share.share({ title: "StudyPulse stats", message: statsCsv(data) });
    } catch {
      setExportError("Couldn't open the share sheet. Try again.");
    }
  }

  const shown = data && data.weeks === weeks ? data : null;
  const maxMinutes = Math.max(0, ...(shown?.courses.map((c) => c.focus_minutes) ?? []));

  const bar = (value: number, fill: string) => (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ height: 8, borderRadius: 4, backgroundColor: theme.colors.surfaceContainerHighest }}
    >
      <View style={{ height: 8, borderRadius: 4, width: `${value}%`, backgroundColor: fill }} />
    </View>
  );

  return (
    <TabScreen
      title="Stats"
      description="How your focus time lines up with your grades."
      {...(shown?.courses.length
        ? { primaryAction: { label: "Export", onPress: () => void exportCsv() } }
        : {})}
      loading={!data}
      error={error}
      refreshing={refreshing}
      onRefresh={() => void refresh()}
    >
      <ChoiceChips
        label="Period"
        options={PERIOD_OPTIONS.map((w) => ({ value: w, label: `${String(w)} weeks` }))}
        value={weeks}
        onChange={setWeeks}
      />
      {exportError ? <Notice tone="error">{exportError}</Notice> : null}
      {!shown ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}
        >
          Loading…
        </Text>
      ) : (
        <>
          <MetricGrid>
            <MetricCard label="Focus this week" value={hours(shown.this_week_minutes)} />
            <MetricCard
              label="Average grade"
              value={shown.average_grade === null ? "—" : percent(shown.average_grade)}
              detail={shown.average_grade === null ? "No grades yet" : "Across your courses"}
            />
          </MetricGrid>

          <View style={{ gap: theme.spacing.related }}>
            <SectionHeading>Summary</SectionHeading>
            {summarize(shown).map((line) => (
              <Text key={line} style={[theme.type.bodyLarge, { color: theme.colors.onSurface }]}>
                {line}
              </Text>
            ))}
          </View>

          {shown.courses.length ? (
            <View style={{ gap: theme.spacing.related }}>
              <SectionHeading>By course</SectionHeading>
              <ListCard label="Focus and grade by course">
                {shown.courses.map((c, i) => {
                  const below = belowTarget(c);
                  const grade =
                    c.current_grade === null ? "No grades yet" : percent(c.current_grade);
                  return (
                    <View
                      key={c.id}
                      accessible
                      accessibilityLabel={[
                        courseLabel(c),
                        `${formatMinutes(c.focus_minutes)} of focus`,
                        `grade ${grade}`,
                        below && c.target_grade !== null
                          ? `below the ${percent(c.target_grade)} target`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                      style={{
                        gap: theme.spacing.related,
                        padding: theme.spacing.card,
                        borderTopWidth: i === 0 ? 0 : 1,
                        borderTopColor: theme.colors.outlineVariant,
                        backgroundColor: theme.colors.surfaceContainerLow,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          alignItems: "center",
                          gap: theme.spacing.related,
                        }}
                      >
                        <CourseChip code={courseLabel(c)} colorHex={c.color} />
                        <Text
                          style={[
                            theme.type.body,
                            { color: theme.colors.onSurfaceVariant, flexShrink: 1 },
                          ]}
                        >
                          {c.name}
                        </Text>
                      </View>
                      <Text style={[theme.type.body, { color: theme.colors.onSurface }]}>
                        Focus: {formatMinutes(c.focus_minutes)}
                      </Text>
                      {bar(
                        barWidth(c.focus_minutes, maxMinutes),
                        courseSwatch(c.color, theme.name).stripe,
                      )}
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: theme.spacing.half,
                        }}
                      >
                        <Text style={[theme.type.body, { color: theme.colors.onSurface }]}>
                          Grade: {grade}
                        </Text>
                        {below ? (
                          <>
                            <Icon name="warning-amber" size={16} color={theme.colors.error} />
                            <Text style={[theme.type.labelLarge, { color: theme.colors.error }]}>
                              Below target
                            </Text>
                          </>
                        ) : null}
                      </View>
                      {c.current_grade === null
                        ? null
                        : bar(barWidth(c.current_grade, 100), theme.colors.primary)}
                    </View>
                  );
                })}
              </ListCard>
            </View>
          ) : null}
        </>
      )}
    </TabScreen>
  );
}
