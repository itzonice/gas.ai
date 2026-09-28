// axe-core in component tests: catches missing names, bad ARIA, broken landmarks and
// heading structure on every render we test. jsdom has no layout or colors, so color
// contrast and target size are checked in the browser audit (scripts/a11y-audit.mjs).
import axe from "axe-core";
import { expect } from "vitest";

export async function expectNoAxeViolations(container: Element = document.body) {
  const { violations } = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] },
    rules: {
      "color-contrast": { enabled: false },
      // Screens render without the app shell (header, nav, main) in unit tests.
      region: { enabled: false },
      "landmark-one-main": { enabled: false },
      "page-has-heading-one": { enabled: false },
    },
  });
  if (violations.length) {
    expect.fail(
      `axe found ${String(violations.length)} problem(s):\n` +
        violations
          .map((v) => `- ${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)
          .join("\n"),
    );
  }
}
