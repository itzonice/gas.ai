// One task in a plain list. The row body opens the task; the checkbox and the overflow
// menu are separate 48 pt targets beside it, not nested inside it.
import { courseSwatch } from "@studypulse/tokens/native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { useAppTheme } from "../../theme";
import { CourseChip } from "./CourseChip";
import { OverflowMenu, type MenuItem } from "./OverflowMenu";
import { Icon } from "./Icon";

export interface TaskRowProps {
  title: string;
  course: { code: string; colorHex?: string | null };
  dueText?: string;
  overdue?: boolean;
  meta?: ReactNode;
  done: boolean;
  onToggleDone: (done: boolean) => void;
  onOpen: () => void;
  menuItems?: readonly MenuItem[];
  isFirst?: boolean;
}

export function TaskRow({
  title,
  course,
  dueText,
  overdue,
  meta,
  done,
  onToggleDone,
  onOpen,
  menuItems,
  isFirst,
}: TaskRowProps) {
  const theme = useAppTheme();
  const stripe = courseSwatch(course.colorHex, theme.name).stripe;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing.half,
        paddingLeft: theme.spacing.related,
        paddingRight: theme.spacing.half,
        borderLeftWidth: theme.layout.courseStripe,
        borderLeftColor: stripe,
        borderTopWidth: isFirst ? 0 : 1,
        borderTopColor: theme.colors.outlineVariant,
        backgroundColor: theme.colors.surfaceContainerLow,
      }}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={done ? `Mark ${title} not done` : `Mark ${title} done`}
        onPress={() => {
          onToggleDone(!done);
        }}
        style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}
      >
        <Icon
          name={done ? "check-box" : "check-box-outline-blank"}
          size={24}
          color={done ? theme.colors.primary : theme.colors.onSurfaceVariant}
        />
      </Pressable>

      <Pressable
        accessibilityRole="link"
        accessibilityHint="Opens the task"
        onPress={onOpen}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: 48,
          paddingVertical: 12,
          gap: 2,
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
          {title}
        </Text>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: theme.spacing.related,
          }}
        >
          <CourseChip code={course.code} colorHex={course.colorHex} />
          {overdue ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
              <Icon name="warning-amber" size={16} color={theme.colors.error} />
              <Text style={[theme.type.labelLarge, { color: theme.colors.error }]}>Overdue</Text>
            </View>
          ) : null}
          {dueText ? (
            <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
              {dueText}
            </Text>
          ) : null}
          {meta ? (
            <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>{meta}</Text>
          ) : null}
        </View>
      </Pressable>

      {menuItems?.length ? (
        <OverflowMenu label={`More actions for ${title}`} items={menuItems} />
      ) : null}
    </View>
  );
}
