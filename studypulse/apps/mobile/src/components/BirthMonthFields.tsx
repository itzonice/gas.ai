// Birth month and year for the age gate (launch safety S12): asked neutrally, with the
// reason, and nothing kept but a yes/no on "13 or older".
import { AGE_MESSAGES } from "@studypulse/core/auth";
import { Text, View } from "react-native";

import { useAppTheme } from "../theme";
import { TextField } from "./ui/TextField";

export interface BirthMonthValue {
  month: string;
  year: string;
}

export function BirthMonthFields({
  value,
  onChange,
}: {
  value: BirthMonthValue;
  onChange: (value: BirthMonthValue) => void;
}) {
  const theme = useAppTheme();
  return (
    <View accessibilityRole="none" style={{ gap: theme.spacing.related }}>
      <Text style={[theme.type.labelLarge, { color: theme.colors.onSurface }]}>Date of birth</Text>
      <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
        {AGE_MESSAGES.why}
      </Text>
      <View style={{ flexDirection: "row", gap: theme.spacing.related }}>
        <View style={{ flex: 1 }}>
          <TextField
            label="Month (1–12)"
            keyboardType="number-pad"
            maxLength={2}
            autoComplete="birthdate-month"
            value={value.month}
            onChangeText={(month) => {
              onChange({ ...value, month });
            }}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            label="Year"
            keyboardType="number-pad"
            maxLength={4}
            autoComplete="birthdate-year"
            value={value.year}
            onChangeText={(year) => {
              onChange({ ...value, year });
            }}
          />
        </View>
      </View>
    </View>
  );
}
