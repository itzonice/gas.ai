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

## Study screens (flashcards, Learn, Test, Match, notes)

Research behind the rules (what each source says, and where we applied it):

| Source                                                                                                                                         | What it asks for                                                                                                                                                  | Where we apply it                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [WCAG 2.2, what's new](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/) (published Oct 2023)                                       | Nine new criteria. The AA ones: Focus Not Obscured (2.4.11), Dragging Movements (2.5.7), Target Size Minimum (2.5.8), Accessible Authentication Minimum (3.3.8).  | No dragging anywhere (Match picks two tiles); targets are 48 px, over the 24 px minimum; sticky bars never cover a focused control (the phone's floating button is hidden in sessions). |
| [WCAG 2.1.4 Character Key Shortcuts](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html)                                 | A shortcut made of single characters must be off-able, remappable, or only active while the component has focus.                                                  | Flashcard keys (arrows, 1 to 4) only work while focus is inside the session; the app-wide "g then…" shortcuts can be switched off.                                                      |
| [WCAG 2.2.1 Timing Adjustable](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html)                                             | Time limits can be turned off, adjusted, or extended, unless essential. A quiz timer isn't essential.                                                             | Test has no timer at all; Match's clock only counts up as a score and can be hidden.                                                                                                    |
| [WCAG 2.3.3 Animation from Interactions](https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions) and `prefers-reduced-motion` | Motion triggered by interaction can be disabled unless essential; the CSS reduced-motion query is a sufficient technique. Don't blanket-disable useful animation. | The card turn-over animation exists only under `prefers-reduced-motion: no-preference`; the timer and progress bars keep working.                                                       |
| [WCAG 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)                                       | 24 by 24 CSS px, or enough spacing; equivalents and inline text are excepted.                                                                                     | We hold to the stricter 48 px in CLAUDE.md; the browser audit measures every control on the study screens.                                                                              |
| [Apple HIG, Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)                                        | Hit targets of at least 44 by 44 pt; check every critical flow with VoiceOver, Reduce Motion, and Large Text.                                                     | Every mobile control is 48 pt; the VoiceOver and Reduce Motion passes are on the manual list below.                                                                                     |
| [Android accessibility basics](https://developer.android.com/guide/topics/ui/accessibility/apps)                                               | Touch targets of at least 48 dp; text contrast 4.5:1 (3:1 for large or bold text); give every element a description of its purpose; unique labels in lists.       | The card, rating, option, and tile buttons have labels that say what they do and, for lists, which item (for example "Star Mitochondrion").                                             |
| Practice for flip cards (screen-reader and keyboard behavior, from published component guidance)                                               | Use a real button; say which side is showing after each flip; keep focus where it is; announce politely, not assertively.                                         | The card is one `<button>` whose name is the visible side; a polite live region says "Definition: …" after each flip; focus never moves on a flip.                                      |

What that means for each screen:

- **Flashcards:** the card is one button (Space or Enter turns it). The rating buttons show
  the number key and when the card will come back, in words. Previous and Skip are buttons,
  so nothing needs a gesture.
- **Learn:** right and wrong are words with an icon ("Correct", "Not quite", "Correct
  answer", "Your answer"), never color alone. After an answer focus moves to Continue. A
  typed answer that was marked wrong has "I was right".
- **Test:** every question is a `fieldset` with a `legend`; options are real radio buttons;
  typed answers have labels. The results list each answer in words.
- **Match:** tiles are buttons with `aria-pressed`; matched tiles say "matched"; every
  outcome goes to a polite live region.
- **Notes:** the editor is a labelled `textarea` with a labelled toolbar; the save status is
  a polite live region (Saved, Saving, or the error, with "your text is still here"); Preview
  is built from parsed blocks, never raw HTML.

Checked automatically: axe in every study component test (`components/study/study.test.tsx`),
and the browser audit (`pnpm --filter @studypulse/web a11y`) covers the Study hub, a set, each
mode (before and during a session), the note editor and its preview, and the dialogs, at phone,
tablet, and desktop widths in both themes. Still to do by hand: the VoiceOver and TalkBack
passes below, including the four study modes.

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

- [ ] VoiceOver (iOS): swipe through Today, Calendar, Courses, Study (a set, then
      Flashcards, Learn, Test, Match, and a note), Focus, and Stats. Every
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
