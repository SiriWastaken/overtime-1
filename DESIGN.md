# Design system — "Mission control"

Source of truth: `src/app/globals.css` (tokens in `:root`); live reference at `/styleguide`. A deep-space control panel that stays out of the data's way: black space, neutral greys, one accent. Structure is deliberately unlike match13.com: no centred pill nav, no hero on a painted sky, no top-right season chip, no Teams/Events/Stats taxonomy.

## Structure (by task)
- **Rail** (`Nav.tsx`): left icon rail on desktop (Explore, Scout, Pick, Predict, Find; Directory, Season, Calm at the foot); a bottom dock on phones. Every icon has a text label; one icon set, 1.75 stroke.
- **Palette** (`Palette.tsx`, ⌘K / Ctrl+K / `/`): teams, events, places, season, Calm mode.
- **Explore** `/`: "Find a team." + search (the primary action) + an open Top 10, beside the team map. **Teams** `/teams` (list) and `/teams/[n]` (team report; the card's primary button is "View team report"; `/scout` redirects). **Pick** `/pick` launch pad. **Predict** `/predict`. **Directory** `/directory`.

## Colour (no hue between 250° and 320°)
- Background `--bg #06080b`; one raised surface `--bg-2 #0b0e13` (hover `--bg-3`). Hairlines `--line` 8% / `--line-2` 16% white; `--fill` 4%.
- Text: `--text #eceef1`, `--text-2 #a9b0ba`, `--text-3 #7f8792` (three levels only).
- One accent `--accent #3fe6ff`: current place, focus, primary button, top-10 team numbers, map selection.
- EDGE only: `--pos #5fe0a0` (helps), `--neg #ff8a5c` (hurts). Alliance identity only: `--red #ef5b6c`, `--blue #4f8fe8`, always with a label.
- Background stars: white / warm white, dim, slow parallax, a shooting star every 25–60 s; one deep-teal haze at 6%. Verified 2026-11-21 by sampling screenshots: 0 violet pixels on Explore; the only hits on Pick (0.006%) are anti-aliased edges of red alliance text.

## Scales
- Type: five sizes `--t-1..5` = 12 / 14 / 16 / 24 / 40. Barlow Condensed for display and numbers, Geist for UI, tabular numerals, numbers right-aligned.
- Spacing: 4/8 grid `--s1..s8` = 4 8 12 16 24 32 48 64.
- Radius: `--r-0 4` (bars, kbd), `--r-1 8` (controls), `--r-2 12` (surfaces).
- Motion: `--d-1 120ms`, `--d-2 240ms`, `--d-3 600ms`; `--ease-out`, `--ease-spring`.
- Surfaces: two levels. Tables, stats rows, lists and the directory sit on the background with hairlines; only panels that group controls (alliance pads, win chance, chart, palette, card) are raised. No blur, no drop shadows.

## Glow and motion rules
- Glow only on the map's top 10 and the active selection; everything else is flat.
- Animations that stay (each says something): table rows re-sorting, card slide-in, the win-chance rope (spring) and its swing label, a robot snapping into a slot, constellation lines drawing as an alliance fills, the "live" dot, the rare shooting star. Cut: stagger, count-up, page warp, logo orbit, #1 orbit ring, sparkles, twinkle, nebula drift, gauge pull-in, rotating suggestions.
- Calm mode and `prefers-reduced-motion` reduce all of it to instant changes.

## Components
- `EdgeGauge`: diverging bar centred on the median robot (left hurts, right helps), flat fill, shared ±60 scale, optional 80% bracket, dashed + "early" under 8 matches. The only way EDGE is shown.
- `Avatar` (`bits.tsx`): the team's FIRST avatar from `/api/v1/avatars/{n}?year=` (TBA media, cached through the TBA client's ETag store), 20 px in rows, 32 px on the card, 40 px on the report; pixelated, hairline frame because many avatars are opaque black. No avatar → transparent placeholder, so rows stay aligned.
- `hot(rank)`: accent on the season's top 10 team numbers (rank-based, so it means the same thing every season).
- **Team map** (`Galaxy.tsx`): offense up, defense across, both on an asinh scale around the median (scaled by IQR) so the core opens up and no quadrant is empty. Zoomed out: screen-space density hexes + the top 10 labelled. Zoomed in: every team a dot (brighter / larger = more EDGE) with collision-free labels. Quadrant names beside the medians; one key line. Hover = tooltip, click = card, search flies there. Phones: a 240 px preview band above the list with "Expand map".
- **Launch pad** (`LaunchPad.tsx`): two triangle pads, lines between filled slots, "Win chance" rope; "Suggested for Red/Blue" list with one primary Add; picklist tray; drag or tap.
- `Tug`: each side's colour holds its win share; damped spring; swing label after a change.

## Voice
Brief, specific labels ("Offense", "Defense", "Win chance", "Points added", "Recent scoring"); clock motif only in states: "Clock’s running…", "Sudden death: no match.", "Timeout.", "Still in the pits." Never round a probability to 100%.

## Verified 2026-11-21
Lighthouse accessibility 100 (mobile) on Explore, Teams, team page, Pick, Predict, Directory. Map zooming at 4× CPU throttle: median 8.4 ms, max 17.1 ms, 0 frames over 33 ms. No horizontal overflow at 390 px on Explore, team page, Pick.
