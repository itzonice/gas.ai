// Letter grades from a per-course scale (or the common US plus/minus default).
import { z } from "zod";

export const letterScaleSchema = z
  .array(z.object({ letter: z.string().trim().min(1).max(5), min: z.number().min(0).max(100) }))
  .min(1)
  .max(20)
  .superRefine((scale, ctx) => {
    scale.forEach((entry, i) => {
      const prev = scale[i - 1];
      if (prev && entry.min >= prev.min) {
        ctx.addIssue({
          code: "custom",
          path: [i, "min"],
          message: "Minimums must strictly decrease",
        });
      }
      if (scale.findIndex((e) => e.letter === entry.letter) !== i) {
        ctx.addIssue({ code: "custom", path: [i, "letter"], message: "Letters must be unique" });
      }
    });
  });

export type LetterScale = z.infer<typeof letterScaleSchema>;

export const DEFAULT_LETTER_SCALE: LetterScale = [
  { letter: "A", min: 93 },
  { letter: "A-", min: 90 },
  { letter: "B+", min: 87 },
  { letter: "B", min: 83 },
  { letter: "B-", min: 80 },
  { letter: "C+", min: 77 },
  { letter: "C", min: 73 },
  { letter: "C-", min: 70 },
  { letter: "D+", min: 67 },
  { letter: "D", min: 63 },
  { letter: "D-", min: 60 },
  { letter: "F", min: 0 },
];

/**
 * The letter for a percent: the first entry whose minimum it meets. Percents are
 * compared after rounding to 2 decimals so 89.999999 from float math isn't a B+.
 * Below every minimum gives the last letter.
 */
export function letterFor(percent: number, scale: LetterScale = DEFAULT_LETTER_SCALE): string {
  const rounded = Math.round(percent * 100) / 100;
  const hit = scale.find((entry) => rounded >= entry.min);
  return (hit ?? scale[scale.length - 1])?.letter ?? "";
}

/** The minimum percent for a letter, e.g. to turn a "B+" target into 87. */
export function minPercentFor(
  letter: string,
  scale: LetterScale = DEFAULT_LETTER_SCALE,
): number | null {
  return scale.find((entry) => entry.letter === letter)?.min ?? null;
}
