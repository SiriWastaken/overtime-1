# Design system — "Orrery: playful lab"

Source of truth: `src/app/globals.css` (tokens in `:root` and `:root[data-theme='dark']`). A science-museum exhibit for FRC data: a playful, chunky container around exact, tabular, honest numbers. Never childish, never templated, nothing shared with match13.com (no centred pill nav, no search-over-illustration hero, no halftone).

## Structure
- **Top bar** (`Header.tsx`): logo, the places (Pick, Teams, Events), search (⌘K), season, Dark and Calm toggles. Left-aligned, 2px ink bottom rule. Phones keep logo, search and a Settings button (season, dark, calm in the palette).
- **Phone dock** (`Nav.tsx` `Tabs`): Home, Pick, Teams, Events. The current one sits in a sunshine pill.
- **Home** `/`: "Find a team or event" + search; the dice sticker (the one tilted element); "Today" (live) or "Latest events" as sticker cards in a scroll strip; Model vs reality (Monte Carlo drop) beside Biggest movers; pill links to Pick, Compare, Lab, Track record, Data & API.
- **Pick** `/pick` (`PickBoard.tsx`): alliance selection with Fit and the draft clock; the event's field map on desktop.
- **Team page**: identity, one hero numeral (EDGE) with its 80% range, a "Why this number" card (inputs, method, uncertainty), the annotated trend chart, then light tables.

## Colour (light; no hue between 250° and 320°)
- Paper `#FFF3D6` page, card `#FFFFFF`, ink `#1D1D1F`, ink-2 `#5B5B60`. Text is only ink or ink-2.
- Sunshine `#FFD23F`: primary buttons, current place, the sticker, highlights.
- Data palette, fixed order: blue `#3B82F6`, pink `#FF7AA8`, mint `#7BE0A4`, coral `#FF6B4A`, sunshine. Fills, lines and marks only, always with a 2px ink outline (fills alone are under 3:1 on paper). Positive = mint, negative = coral, always with a sign or icon.
- Text on any saturated fill uses `--ink-on-fill` (#1D1D1F) in both themes. Never blue, pink or coral text.
- Red / blue alliances map to coral / blue, always labelled.

## Dark (designed, not inverted)
Page `#17171A`, card `#232328`, cream `#F5E9C8` for text and outlines, ink-2 `#C2B897`. Shadows are `#0B0B0D` (a darker card), so outlines carry the structure. Sunshine stays a light fill with dark text; positive and negative text switch to mint and a lighter coral. Saved choice, else the system's; applied before paint.

## Shape and depth
- 2px solid ink outlines (`--outline`). Radii 8 (controls), 12 (small cards), 16 (cards), 999 (chips, bars, pills).
- Hard offset shadows only: `--shadow` 3px 3px 0, `--shadow-sm` 2px 2px 0. Hover lifts 2px and grows the shadow; press moves 2px down-right and the shadow collapses.
- Chunky is for containers, chips, buttons and callouts. Dense data stays light: 1px hairlines at 15% ink, tabular numerals, right-aligned numbers. Inline links, list rows, segments and small in-row actions are flat.
- Tilt: only the hero sticker (-1.5°).

## Type
Bricolage Grotesque 800 (display: headings, hero numerals) + Geist (UI and every tabular number). Five sizes: 12 / 14 / 16 / 28 / 56; hero numerals at 56. Sentence case, no uppercase transforms. Code uses the system monospace.

## Motion
Pop easing `cubic-bezier(.34,1.56,.64,1)` at 180–240 ms for UI; chart lines draw in over 700 ms; Monte Carlo dots drop and stack; the dice rolls; the mascot's moon orbits once. No count-up, no list stagger (cut on purpose: a scout reads the exact number at once). Confetti only for a real milestone (the team won its latest event), once per session, lazy-loaded, under 1 s. Only transform and opacity animate. Reduced motion and Calm make everything instant and skip confetti.

## Signatures
- **Model vs reality** (`MonteCarlo.tsx`): 120 replays of a real match's frozen pre-match forecast drop into a histogram; the real margin is a sunshine tag. Blue dots carry a dashed outline as a second cue. Table fallback under the chart.
- **Dice** (`Dice.tsx`): rolls a random rated team.
- **Mascot** (`Mascot.tsx`): a sunshine planet with a pink moon, under 1 KB of SVG, moods idle / think / happy / oops. Only in empty, loading, success, 404 and beside the Monte Carlo run. Never beside errors that matter.
- **Annotated trend** (`RatingChart`): 3px round line, hatched 80% band, hand-drawn leader notes for the season high and the biggest climb at one event; table fallback.

## Help
One look for both: the "?" tip and the "why" chip are small chunky pills that open a chunky card. "Why" covers inputs, method, uncertainty.

## Voice
Dry, witty nerd. Short and exact. "Rolling the dice…" "No events yet. The robots are stretching." "This number is 80% sure of itself." "Won Daly. Nobody panic." Humor only in empty, loading, success and 404 states and stat tooltips; never in methodology or errors that matter. No emoji.

## Verified 2026-11-21
Lighthouse accessibility 100 (mobile) on Home and a team page. Text contrast scan passes on Home, Pick, a team page, Events and Teams list in light and dark. No horizontal overflow at 390 px on Home, Pick, team page. Fonts ~85 KB (over the ~60 KB budget).
