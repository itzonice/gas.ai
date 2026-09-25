# Accessibility audit

Target: WCAG 2.2 AA, plus the stricter rules in CLAUDE.md (48 px targets, status never by
color alone, polite timer announcements, layouts that hold at 200% text).

## How to run it

| Check                                          | Command                                                 | Where                   |
| ---------------------------------------------- | ------------------------------------------------------- | ----------------------- |
| axe on every screen's component tests          | `pnpm test`                                             | CI, every push          |
| Browser audit (axe, keyboard, targets, reflow) | `pnpm local`, then `pnpm --filter @studypulse/web a11y` | Locally, before release |

The browser audit (`apps/web/scripts/a11y-audit.mjs`) signs in as the demo account and,
for every screen at 375, 768, and 1600 px in light and dark themes:

- runs axe-core with the WCAG 2.0/2.1/2.2 A and AA rules and best practices, including
  color contrast (which jsdom can't check)
- opens the dialogs and menus (Add assignment, Add score, overflow menu, Delete account)
  and audits them open
- tabs through each page: the skip link must be first, and every stop must show a
  visible focus indicator (a 2 px outline or a ring)
- measures every control: at least 48 x 48 px, links inside running text excepted
- checks reflow: no horizontal scrolling at 320 px wide, or at 1280 px with 200% text

It writes `a11y-report.json` and exits 1 on any finding. Set `A11Y_BASE_URL` to audit a
preview deployment.

## Results (web)

First run: 318 findings. Final run: **none**, on all 10 screens, 4 dialogs and menus,
3 widths, and both themes.

| Finding                                                                                                                     | Fix                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target size (286 findings): the footer links (Privacy, Terms, Help) were 48 px tall but narrower than 48 px on every screen | Minimum 48 x 48 px with padding. (The upload screen's hidden file input was also flagged; its visible label is the real target, and the audit now measures the label.) |
| The skip link could be under 48 px tall when focused                                                                        | Minimum 48 px                                                                                                                                                          |
| The phone's floating "Start focus" button sat outside every landmark                                                        | Wrapped in `<nav aria-label="Quick action">`; hidden on the Focus screen, where it duplicated the primary action                                                       |
| After a client-side navigation, focus stayed on the clicked link                                                            | `RouteFocus` moves focus to `<main>` on every route change (like the skip link); a fresh load still starts at the skip link                                            |

No contrast, naming, ARIA, or heading findings came up in either theme. The vetted course
palette and the semantic tokens pass as designed.

### Keyboard pass (manual, in the browser)

| Widget              | Result                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Skip link           | First tab stop on a fresh load; Enter moves focus to `<main>`                                                                   |
| Overflow menus      | Enter opens with focus on the first item; arrows move; Escape closes and returns focus to the button                            |
| Calendar grid       | One tab stop; arrow keys move by day and week; each day's name says its date and items                                          |
| Dialogs and drawers | Focus moves in and is trapped (12 tabs stayed inside); Escape closes; focus returns to the opener                               |
| Focus timer         | The live region announces only start, pause, and finish (unchanged after 3 s of ticking); the clock is `role="timer"`, not live |
| Onboarding          | Each step moves focus to its heading ("Step 2 of 3: Study time")                                                                |

### Regression guard

`apps/web/test/axe.ts` runs axe on the rendered Today, Calendar, Courses, Course detail,
Syllabus review, Focus, Stats, Settings, Onboarding, and Upgrade screens in their unit
tests. `test/axe-sanity.test.tsx` proves the helper actually fails on a violation.

## Mobile (iOS and Android)

A screen-reader pass on real devices (VoiceOver on iOS, TalkBack on Android) can't run in
the build environment. What was checked in code:

- Every `Pressable` has a role and a label (the focus button says "Start focus session";
  task checkboxes say "Mark Lab 3 done" with a checked state; the overflow menu reports
  expanded/collapsed).
- Targets are at least 48 x 48 (the task checkbox, overflow button, header and empty-state
  actions, and tab bar items); the floating focus button is 56 px.
- Headings use `accessibilityRole="header"`; metric cards read as one element ("Due this
  week, 4, open tasks").
- Nothing sets `allowFontScaling={false}`, so text follows the system size. **Fixed:** the
  course chip truncated its code to one line; it now wraps, so the code stays readable at
  the largest text sizes.
- Course chips always show the code as text; status is in words.

Before each store release, run these by hand on one iOS and one Android device, and
record the results here:

- [ ] VoiceOver (iOS): swipe through Today, Calendar, Courses, Focus, and Stats. Every
      element is announced with a name and role, in reading order, and nothing is announced
      twice.
- [ ] TalkBack (Android): the same pass.
- [ ] Focus timer: start, pause, and finish are each announced once; the ticking clock
      isn't.
- [ ] Largest accessibility text size (iOS "AX5", Android 200%): no clipped or overlapping
      text, and the tab bar labels still fit.
- [ ] Switch Access / Full Keyboard Access: every control is reachable, and the overflow
      menu sheet can be closed.
- [ ] Reduce Motion on: no animation needed to understand any screen.
