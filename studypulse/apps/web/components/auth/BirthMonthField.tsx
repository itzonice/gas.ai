"use client";

// Birth month and year (launch safety S12). Asked neutrally: no default answer, no hint
// about the minimum age, and the reason we ask. Only a yes/no on "13 or older" is kept.
import { AGE_MESSAGES, birthYearOptions, MONTH_NAMES } from "@studypulse/core/auth";
import { useMemo } from "react";

import { SelectField } from "@/components/ui";

import styles from "./auth.module.css";

export interface BirthMonthValue {
  month: string;
  year: string;
}

export function BirthMonthField({
  value,
  onChange,
  error,
}: {
  value: BirthMonthValue;
  onChange: (value: BirthMonthValue) => void;
  error?: string | undefined;
}) {
  const years = useMemo(() => birthYearOptions(), []);
  return (
    <fieldset className={styles.fieldset} aria-describedby="birth-why">
      <legend className={styles.legend}>Date of birth</legend>
      <p id="birth-why" className={styles.fieldsetHint}>
        {AGE_MESSAGES.why}
      </p>
      <div className={styles.fieldRow}>
        <SelectField
          label="Month"
          name="birth-month"
          autoComplete="bday-month"
          value={value.month}
          onChange={(e) => {
            onChange({ ...value, month: e.currentTarget.value });
          }}
          {...(error ? { error } : {})}
        >
          <option value="">Month</option>
          {MONTH_NAMES.map((name, i) => (
            <option key={name} value={String(i + 1)}>
              {name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Year"
          name="birth-year"
          autoComplete="bday-year"
          value={value.year}
          onChange={(e) => {
            onChange({ ...value, year: e.currentTarget.value });
          }}
        >
          <option value="">Year</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </SelectField>
      </div>
    </fieldset>
  );
}
