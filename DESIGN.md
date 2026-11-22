# Design system — "Overtime"

Source of truth: `src/app/globals.css` (tokens in `:root`); dev-only reference at `/styleguide`. An alliance-selection copilot under a clock: near-black, neutral greys, one accent, flat. Every screen serves a pick decision. Structure is deliberately unlike match13.com: no centred pill nav, no search hero, no top-right season chip.

## Structure (three destinations)
- **Rail** (`Nav.tsx`): Pick, Teams, Settings. Left rail on desktop (logo links home), bottom dock on phones. Every icon has a text label; one icon set, 1.75 stroke.
- **Pick** `/` (`PickBoard.tsx`): "Alliance selection", the event switch ("At …"), your three seats (Captain, Pick 1, Pick 2), the win-chance meter, the best fit with the one primary button, and the ranked list (By fit / Your list). Desktop ≥1100 px adds the team map as the field on the right. `/pick`, `/predict`, `/lab` redirect here (308, `next.config.ts`).
- **Teams** `/teams`: the map with search and the top 10; `?view=list` is the full sortable table. `/teams/[n]` is the full report. `/scout`, `/directory` redirect to Teams.
- **Settings** (the ⌘K palette in settings mode): Calm mode, my team, seasons with a model, and the "More" links (Events, Track record, How it works, Data & API).
- **Team card** (`TeamPeek.tsx`): opens from any row, the map or ⌘K. One primary action, pinned to the bottom: "Pick {n}" on Pick, "Add to picklist" elsewhere. "Full report" and "This is my team" are links.

## Colour (no hue between 250° and 320°)
- Background `--bg #06080b`; one raised surface `--bg-2` (hover `--bg-3`). Hairlines `--line` 8% / `--line-2` 16% white; `--fill` 4%. No background decoration.
- Text: `--text`, `--text-2`, `--text-3` (three levels only).
- One accent `--accent #3fe6ff`: current place, focus, primary button, the next open seat, the running clock's border, top-10 team numbers, map selection.
- `--pos` / `--neg`: EDGE and Fit direction; `--neg` also marks the clock's last 20 s and overtime, and stale data. Alliance identity only: `--red`, `--blue`, always with a label.

## Scales
- Type: five sizes `--t-1..5` = 12 / 14 / 16 / 24 / 40. Barlow Condensed for display and numbers, Geist for UI, tabular numerals, numbers right-aligned.
- Spacing: 4/8 grid `--s1..s8` = 4 8 12 16 24 32 48 64 (no raw px in spacing).
- Radius: `--r-0 4` (bars, kbd, avatars), `--r-1 8` (controls), `--r-2 12` (surfaces).
- Motion: `--d-1 120ms`, `--d-2 240ms`, `--d-3 600ms`; `--ease-out`; `--ease-spring` only for a team landing in a seat (`.snap`).
- Targets: every control ≥ `--tap` 44 px (`button.small` is small type, full height).
- Surfaces: two levels. Lists and tables sit on the background with hairlines; raised: the best-fit panel, the clock, the card, the palette.

## Motion (cause and effect only)
A team lands in a seat (snap), the win-chance meter shifts, the list dims while it re-ranks, the card slides in, rows re-sort, the map flies to a search. Nothing loops or plays on its own. Calm mode and `prefers-reduced-motion` make all of it instant.

## Components
- **Fit** (`/api/v1/fit`, `allianceFit` in `lib/edge.ts`): EDGE re-evaluated with your filled seats pinned as partners: win-chance points gained by putting a team in your next open seat. Shown as a signed number ("+9"; one decimal under 10). Ranks the board.
- **EDGE** `EdgeGauge`: season-wide win-chance points vs a median robot; diverging bar, ±60 scale, 80% bracket, "early" under 8 matches. Used on the card, map and tables.
- **Draft clock**: 2:00 per pick, restarts when a seat fills; "Taken" per row and "Declined" per seat remove teams and re-rank; Undo the last; "+0:12 Overtime." past zero. One draft per season + event, saved on this device.
- **Team map** (`Galaxy.tsx`): offense up, defense across (asinh around the median). Zoomed out: density hexes + the top 10 labelled (right, left, above, below; no overlaps). Zoomed in: every team a dot. The key line changes with the zoom level. `bare` = map only (the field on Pick).
- `Avatar`, `hot(rank)` as before.

## Voice
A calm, dry veteran strategist. Short, specific, confident. "Best fit: 1690. +9 win-chance points with your alliance." "Clock’s running." "1690 taken. Re-ranking." "Nobody here yet." Loading: "Warming up…". Errors name the cause and say the board is saved. Humor only in empty, loading and success states. One name per concept: Fit, EDGE, Picklist ("Your list"), Taken, Declined. Never round a probability to 100%.
