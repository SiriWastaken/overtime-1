# EDGE

**How much a robot changes its alliance's chance of winning, compared with a typical robot in its place.**

EDGE is reported in percentage points of win probability. `+18` means: across the partners and opponents this robot could realistically draw this season, an alliance with it is expected to win 18 percentage points more often than the same alliance with a median robot instead.

Code: `src/engine/edge.ts` (math), `src/lib/edge.ts` (season read model), `scripts/edge.ts` (validation), `test/edge.test.ts`.

## Four things that are easy to confuse

| Quantity | What it is | Where |
|---|---|---|
| Observed performance | What happened: scores, per-robot TBA fields (e.g. climb result), win/loss | Match pages, team match history |
| Model-estimated contribution (xPts) | Posterior mean points a robot adds to its alliance's margin per match | Team ratings |
| Counterfactual marginal value (EDGE) | Win-probability change from swapping the robot for a replacement, averaged over contexts | Team ratings, team pages |
| Predicted match outcome | Win probability and score for a specific six-robot match | Match pages, Predict |

EDGE is a model-based counterfactual. It is never observed directly and it is not a causal estimate in the experimental sense: it says what the xPts model implies, no more.

## Definition

The xPts model (see Methodology) gives each robot a posterior for its effect on its alliance's scoring margin:

- `net` = expected own scoring − foul points given away + opponent points suppressed by defense
- `sd` = posterior standard deviation of `net` (components treated as independent)

For season *s*, let the **pool** be every robot with at least 3 played matches. Then

```
r       = median net in the pool                                  (replacement robot)
D_k     = net(p1) + net(p2) − net(o1) − net(o2) − net(o3)         (k = 1..2048 sampled contexts, robots drawn from the pool)
σ_k²    = margin noise at that match's scoring level + 5 · mean posterior variance of the pool
EDGE_i  = mean_k [ Φ((D_k + net_i) / σ_k) − Φ((D_k + r) / σ_k) ]
```

Margin noise and its growth with scoring level are the model run's own estimates (`marginNoiseSd`, `noiseScaling`), the same ones match forecasts use. Every robot is scored against the same sampled contexts (common random numbers), so differences between robots are not Monte Carlo noise.

**Interval.** EDGE increases with `net` at a fixed scoring level, so the 80% interval evaluates EDGE at `net ± 1.28·sd`. It reflects uncertainty about the robot, not about the season's noise estimates.

### Why the median robot is the baseline

| Option | Problem |
|---|---|
| Average (mean) robot | FRC ratings are right-skewed; a handful of elite robots move the mean |
| "Replacement level" percentile (e.g. 20th, as in baseball WAR) | The percentile is arbitrary and the free-agent analogy doesn't fit FRC; every team at an event plays quals |
| Event-specific replacement | Makes EDGE swing with event strength; the same robot would have different EDGEs in the same week |
| Hypothetical zero robot | Not a robot anyone could field; inflates every value |
| **Median rated robot (chosen)** | Robust, parameter-free, season-specific; EDGE = 0 means "typical" |

Implication: about half of rated robots have negative EDGE. That's by construction and isn't a judgement of those teams.

### Why average over contexts

A robot is worth most in close matches and least in blowouts (Φ is flattest in its tails). Evaluating at a single average match would overstate the value of mid-strength robots and understate how quickly value saturates. Drawing partners and opponents from the real season pool gives the expected value over matchups the robot actually faces.

## What EDGE answers, and what it doesn't

| Question | Status |
|---|---|
| How much does a robot contribute? | xPts `net` (points/match), with interval |
| How much does including it change the chance of winning? | **EDGE** |
| How confident should we be? | 80% interval, match count; values under 8 matches are marked provisional |
| How consistently does it perform? | xPts volatility (observed ÷ expected squared forecast error of its alliances) |
| Does its value depend on partners? | Only through match closeness. xPts is additive, with no partner-interaction terms, so **synergy and complementarity are not estimated** |
| How does it perform against stronger opponents? | **Not estimated.** The model has defense terms but no opponent-strength interaction |
| Does it complement its partners' capabilities? | **Not estimated.** Per-component ratings exist (auto/teleop/endgame) and are shown, but there's no complementarity model |

These gaps are intentional. Adding interaction terms is the obvious next step (see Next steps); until it's tested, the product doesn't claim it.

## Statistical safeguards inherited from xPts

- **Season isolation.** Every hyperparameter is estimated online from the current season; no prior-season priors. EDGE's pool, baseline and noise all come from the same season's run.
- **Opponent and partner adjustment.** Contributions come from a joint Gaussian posterior over all robots at an event (exact within-event covariance), so partners and opponents are accounted for, and score credit isn't double-counted.
- **Small samples.** Posteriors shrink toward the season level; robots with fewer than 3 matches don't define the baseline or the contexts.
- **Missing data.** Components without breakdown data aren't imputed.
- **No leakage.** Walk-forward forecasts only see results public before each match.

Known approximation: season ratings store marginal posteriors per component, so EDGE's interval ignores posterior correlation between a robot's components and between partners. This is the same limitation the on-demand forecasts already document.

## Validation

EDGE adds no fitted parameters, so the xPts walk-forward validation (Brier, log loss, calibration, interval coverage, comparison with OPR baselines; see Analytics) covers its inputs. EDGE's own claim, that its units are win-probability points, is checked separately.

**Scale check** (`node scripts/edge.ts <year>`). To first order, replacing all six robots with replacements gives an even match, so `P(red wins) ≈ 0.5 + ΣEDGE(red) − ΣEDGE(blue)`. For every eligible played match, EDGE is computed **only from estimates frozen before that match**; the context pool and the noise fit (log-variance vs log-level regression) are rebuilt every 250 matches from earlier forecasts only. Results (run 2026-11-20 on model `xpts-1.2.0`):

| Season | Matches | Slope (ideal 1) | Brier: EDGE sum / xPts / coin flip | Log loss: EDGE sum / xPts / coin flip |
|---|---|---|---|---|
| 2023 | 16,036 | 1.17 | 0.169 / 0.163 / 0.250 | 0.512 / 0.496 / 0.693 |
| 2024 | 16,692 | 1.14 | 0.169 / 0.164 / 0.250 | 0.516 / 0.502 / 0.693 |
| 2025 | 17,564 | 1.08 | 0.158 / 0.150 / 0.250 | 0.483 / 0.459 / 0.693 |
| 2026 | 18,088 | 0.94 | 0.155 / 0.145 / 0.250 | 0.472 / 0.445 / 0.693 |

Slope by sample size: established robots (all six ≥ 8 matches) 0.94–1.15, thin samples 0.95–1.23. Playoffs 1.02–1.26: EDGE slightly understates playoff advantages in three of four seasons.

How to read it:

1. **The units hold on average.** A summed EDGE advantage of x corresponds to an observed win-rate advantage of about x (slope 0.94–1.17 across four seasons).
2. **EDGE doesn't add linearly.** Binned, moderate predicted advantages are *understated* (2026: predicted +20 → observed +30) and extreme ones *overstated* (+74 → +49, the ceiling). Win probability is non-linear; adding single-robot EDGEs isn't a match forecast.
3. **For match forecasts use xPts.** It beats the EDGE-sum predictor on every split on identical matches, as it should.
4. **EDGE saturates at the top.** An alliance can't win more than 100% of the time, so EDGE for elite robots compresses toward the ceiling (about +50 in 2026). To tell elite robots apart, compare xPts `net`.

No comparison with Statbotics or other platforms has been run. EDGE isn't claimed to be better than any of them.

## Next steps (not implemented)

- Partner and opponent interaction terms in xPts (e.g. per-component saturation: two robots competing for the same scoring resource), tested walk-forward against the additive model before EDGE uses them.
- Store full posterior covariance for season ratings so intervals account for correlation.
- Event-scoped EDGE (pool = that event's teams) for pick lists, shown alongside the season value rather than replacing it.
