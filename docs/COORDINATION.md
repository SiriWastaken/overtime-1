# Coordination note (2026-11-20)

Two Claude sessions share this working tree.

**Session overtime-1-91 (foundation)** owns the data and model infrastructure: TBA sync (`src/lib/sync.ts`, `tba.ts`), SQLite schema (`src/lib/db.ts`), the xPts model and walk-forward runner (`src/engine/model.ts`, `season.ts`, `forecast.ts`, …), the model pipeline (`src/lib/pipeline.ts`, `scripts/overtime.ts`), the public API (`src/app/api/v1`), its tests, plus README.md and DESIGN.md. At the time of writing it was fixing the 2024 model run.

**Session overtime-1-88 (EDGE + design)** first added new files only:

- `src/engine/edge.ts`, `src/lib/edge.ts`, `scripts/edge.ts`, `test/edge.test.ts`, `docs/EDGE.md`
- After 91 confirmed it was done (it no longer edits this tree): the deep-space redesign of `globals.css`, layout, Nav, pages and components; EDGE in `/api/v1` (`/seasons/{year}/edge`, plus `edge` on `/teams/{number}`); `scale` exported from `engine/forecast.ts` (agreed with 91) so EDGE and forecasts share the noise scaling; `latestSyncs()` added to `lib/queries.ts`; `npm run edge`.

**Interfaces EDGE depends on (read-only):** the `ratings` table (`TeamRating` JSON: `net`, `total`, `fouls`, `defense`, `matches`), `model_runs.hyper` (`marginNoiseSd`, `noiseScaling`, `offset`), and `predictions` (`pre_match` `XptsForecast` JSON with per-team contributions). If any of these change shape, `src/lib/edge.ts` must follow.

**Open items:** EDGE is computed at read time (no schema or pipeline change). `edge-check-<year>.json` must be regenerated (`npm run edge -- <year>`) after each model run. The methodology page flags stale results as "out of date". 91 agreed to ping before changing `TeamRating`, `hyper` or forecast shapes.
