# Overtime 1

Season-isolated FRC robot ratings, calibrated match forecasts, ranking/playoff/alliance-selection simulation, published walk-forward validation, and a free public API. Data: The Blue Alliance API v3.

**Principle:** measure what robots can do *this season*. No prior-season rating, reputation or team history enters a current-season rating or forecast.

## Quick start

```sh
npm install
echo "TBA_API_KEY=your_read_key" > .env.local   # https://www.thebluealliance.com/account
npm run sync -- 2026      # discover and pull every event of the season (ETag-cached, incremental)
npm run model -- 2026     # walk-forward model run; prints validation table
npm run build && npm start
```

`npm run update -- 2026` = sync, then re-model only if data changed. While the server runs with a key, it auto-syncs the current season every 5 minutes (`OVERTIME_SYNC_MINUTES`, disable with `OVERTIME_AUTOSYNC=0`). If TBA is unreachable, cached data is served and the UI shows its age.

Requires Node ≥ 24 (built-in `node:sqlite`; TypeScript runs natively). Dependencies: `next`, `react`, `react-dom` only. Database: `data/overtime.db` (`OVERTIME_DB` to override).

## Results (walk-forward, real TBA data, model xpts-1.2.0)

Every forecast is frozen at match start using only results whose `post_result_time` had passed. All models are scored on identical matches.

| Season | Matches | xPts log loss | Best baseline (season ridge OPR) | Favourite won | 80% interval coverage |
|---|---|---|---|---|---|
| 2026 | 18,338 | **0.4483** | 0.4633 | 78.8% | 80.3% |
| 2025 | 17,814 | **0.4602** | 0.4903 | 78.1% | 80.3% |
| 2024 | 16,942 | **0.5041** | 0.5198 | 75.7% | 80.1% |
| 2023 | 16,286 | **0.4974** | 0.5145 | 75.7% | 81.3% |

No comparison with Statbotics is claimed (see Methodology for what a fair one requires).

## Layout

```
src/engine/   pure statistics, no I/O (unit-tested)
  seasons.ts        per-game scoring specs: which breakdown fields → components, who gets credit
  rules.ts          recovers fixed rule values (per-robot category points, RP values) by least squares
  gaussian-state.ts exact Bayesian linear-Gaussian state (full covariance)
  model.ts          xPts season model: event-level posteriors, carry + drift, online hyperparameters,
                    level-scaled noise, defence/suppression, RP logits, reliability
  predictor.ts      leakage-free walk-forward driver (reveals results by post_result_time)
  baselines.ts, metrics.ts, season.ts   baselines, metrics, end-to-end season run
  forecast.ts, playoffs.ts, selection.ts, rankings.ts   on-demand alliance forecasts and simulations
src/lib/      TBA client (ETag cache, retry, dedupe), sync, SQLite schema, persistence, read queries
src/app/      Next.js pages and the public API (/api/v1, no auth, CORS open)
test/         node:test suites; synthetic season generator lives here only
```

## Tests

`npm test` (27 tests): batch-vs-sequential posterior equivalence, rule recovery, no-leakage walk-forward, recovery of known robot strength and calibration on a synthetic season, bracket logic, TBA client caching/retry/offline behaviour, store→model pipeline.

## Known limitations

See `/methodology`. Highlights: additive contributions (no robot-interaction model); defence/suppression is noisy; on-demand forecasts (playoffs, picks, `/predict`) use stored marginals without partner covariance; hyperparameters are defaults pending tuning on past seasons only; off-season events are not rated; round-robin/custom playoff formats are not simulated; no rate limiting on the public API (add one at the proxy if exposed publicly). Logo: coming soon (wordmark only).
