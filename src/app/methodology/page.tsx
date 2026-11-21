import Link from 'next/link';
import { SUPPORTED_GAME_YEARS, seasonSpec } from '@/engine/seasons';
import { DEFAULT_OPTIONS, MODEL_VERSION } from '@/engine/model';
import { pts, stamp } from '@/lib/format';
import { edgeCheckResults, seasonEdges } from '@/lib/edge';
import { defaultYear, modelRun, modelRunHistory } from '@/lib/queries';

export const metadata = { title: 'How it works' };

export default function Methodology() {
  const year = defaultYear();
  const run = year ? modelRun(year) : null;
  const history = year ? modelRunHistory(year) : [];
  const spec = year ? seasonSpec(year) : null;
  const se = year ? seasonEdges(year) : null;
  const checks = edgeCheckResults();
  const runIds = new Map(checks.map((c) => [c.year, modelRun(c.year)?.id ?? null]));
  const n0 = (x: number) => x.toLocaleString();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>How it works</h1>
          <div className="sub">The full method, for the curious. Model {MODEL_VERSION}.</div>
        </div>
      </div>
      <article className="prose">
        <p>
          <strong>The principle:</strong> a rating measures what a robot does this season. Every season starts from zero knowledge. No prior-season rating, reputation, team number or
          award history enters a current-season rating or forecast. Earlier seasons are only used to test the method, never as data for later ones.
        </p>

        <h2 id="edge">EDGE</h2>
        <p>
          <strong>EDGE is how much a robot changes its alliance’s chance of winning, compared with a median robot in its place.</strong> It’s measured in percentage points: +18
          means an alliance with this robot is expected to win about 18 more matches in every 100 than the same alliance with a median robot instead.
        </p>
        <h3>Four numbers that are easy to mix up</h3>
        <table className="agate">
          <thead>
            <tr>
              <th>Number</th>
              <th>What it is</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="strong">Scores and results</td>
              <td>What actually happened, from official FIRST data via The Blue Alliance.</td>
            </tr>
            <tr>
              <td className="strong">xPts</td>
              <td>The model’s estimate of the points a robot adds to its alliance’s margin per match.</td>
            </tr>
            <tr>
              <td className="strong">EDGE</td>
              <td>What that estimate implies for winning, compared with a median robot. A model-based what-if, never observed directly.</td>
            </tr>
            <tr>
              <td className="strong">Match forecast</td>
              <td>Win chance and score range for one specific six-robot match.</td>
            </tr>
          </tbody>
        </table>
        <h3>How it is calculated</h3>
        <p>
          Take the robot’s xPts. Draw a large set of realistic matches by picking two partners and three opponents at random from this season’s rated robots. In each, work out
          the alliance’s chance of winning with this robot, then with a median robot, using the same match-to-match randomness the forecasts use. EDGE is the average difference.
        </p>
        <div className="eq">{`EDGE = average over matches k of [ P(win | robot, k) − P(win | median robot, k) ]
P(win | x, k) = Φ( (partners − opponents + x) / σ_k )`}</div>
        <p>
          Averaging over many matches matters. A robot swings close matches more than blowouts, so its value depends on who it tends to play with and against, not on one
          imagined average match. {se ? `This season, the median robot adds ${pts(se.ctx.replacement, 1)} points per match, from a pool of ${n0(se.ctx.poolSize)} robots with at least 3 matches.` : ''}
        </p>
        <h3>Why a median robot</h3>
        <p>
          The baseline is the season’s median rated robot: half are better, half are worse. The mean is pulled up by a few elite robots. A “replacement level” percentile like
          baseball’s would be an arbitrary choice, and an event-by-event baseline would give the same robot different values in the same week. So by design, about half of all
          robots have a negative EDGE. That says where a robot sits this season, not how good its team is.
        </p>
        <h3>How sure it is</h3>
        <p>
          EDGE rises steadily with xPts, so the model’s 80% range for a robot’s xPts converts directly into an 80% range for its EDGE. Robots with fewer than 8 matches are marked
          “early”.
        </p>
        <h3>What it doesn’t measure</h3>
        <ul>
          <li>
            <strong>Pairings.</strong> The model adds robots’ contributions together. It doesn’t estimate whether two robots work especially well together or compete for the
            same game pieces.
          </li>
          <li>
            <strong>Opponent-specific play.</strong> Defense is estimated, but not whether a robot does better or worse against strong opponents.
          </li>
          <li>
            <strong>Cause and effect.</strong> EDGE is what the model implies, not the result of an experiment.
          </li>
          <li>
            <strong>Top-end detail.</strong> An alliance can’t win more than every match, so EDGE bunches up near the ceiling. To separate elite robots, compare xPts.
          </li>
        </ul>
        <h3>Is it right?</h3>
        <p>
          EDGE adds nothing new to fit, so the forecast tests on the <Link href="/analytics">Model accuracy</Link> page already cover its inputs. To check EDGE’s own units, we use the fact that if every robot were swapped for a median
          one, the match would be even. So an alliance’s win chance should be about 50% plus its robots’ EDGEs minus the opponents’. Using only EDGE values known before each match:
        </p>
        {checks.length ? (
          <>
            <table className="agate">
              <thead>
                <tr>
                  <th>Season</th>
                  <th className="n">Matches</th>
                  <th className="n" title="1.00 means a predicted advantage of x points matched an observed advantage of x points">
                    Scale (ideal 1.00)
                  </th>
                  <th className="n" title="Brier score, lower is better">
                    Brier: EDGE / xPts / coin
                  </th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c) => (
                  <tr key={c.year}>
                    <td>
                      {c.year}
                      {c.run !== runIds.get(c.year) ? <span className="provisional">out of date</span> : null}
                    </td>
                    <td className="n">{n0(c.splits.all.n)}</td>
                    <td className="n strong">{c.splits.all.slope.toFixed(2)}</td>
                    <td className="n">
                      {c.splits.all.brier.edge.toFixed(3)} / {c.splits.all.brier.xpts.toFixed(3)} / {c.splits.all.brier.coinFlip.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              What it shows: on average, EDGE’s units hold. But EDGE values don’t simply add up. Moderate advantages are understated and extreme ones overstated, because win
              chance flattens out near 0% and 100%. That’s why match forecasts come from the full model (xPts beats the EDGE sum on the same matches), and EDGE is for
              understanding a robot.
            </p>
            <details className="more-detail">
              <summary>Calibration detail, {checks[0].year}</summary>
              <table className="agate">
                <thead>
                  <tr>
                    <th className="n">Predicted advantage</th>
                    <th className="n">Observed advantage</th>
                    <th className="n">Matches</th>
                  </tr>
                </thead>
                <tbody>
                  {checks[0].splits.all.bins.map((b) => (
                    <tr key={b.lo}>
                      <td className="n">{(100 * b.predicted).toFixed(0)}</td>
                      <td className="n">{(100 * b.observed).toFixed(0)}</td>
                      <td className="n muted">{n0(b.n)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                Advantage = red’s win chance minus 50%, in percentage points. Each season’s check rebuilds the robot pool and the noise estimate every 250 matches from earlier
                forecasts only, so no later result leaks in. Run it with <code>npm run edge -- {checks[0].year}</code>.
              </p>
            </details>
          </>
        ) : (
          <p className="notice">
            <strong>Not run yet.</strong> The EDGE scale check hasn’t been run on this server. Run <code>npm run edge -- {year ?? 2026}</code> to produce it.
          </p>
        )}
        <p>No comparison with Statbotics or other rating systems has been run, so none is claimed.</p>

        <h2>What xPts is</h2>
        <p>
          xPts is a team’s <em>expected points contributed per match</em>, split by scoring component, with an uncertainty. A team’s net xPts is its expected scoring contribution
          minus the foul points it is expected to give the opponents. A rating of 30 means: put this robot on an average alliance and that alliance should score about 30 more
          points than with a robot that contributes nothing.
        </p>

        <h2>The model</h2>
        <h3>1. Scores are split into components</h3>
        <p>
          Each season has a scoring spec that maps TBA score-breakdown fields onto components (e.g. auto, teleop scoring, endgame) and says who is credited with each. Three kinds
          of credit:
        </p>
        <ul>
          <li>
            <strong>Alliance components.</strong> Points the three robots score together. Credit is split by inference (below).
          </li>
          <li>
            <strong>Per-robot components.</strong> Where TBA reports a per-robot field (leave line, climb level), the robot’s own outcome is observed directly. No inference needed.
            The point value of each outcome is recovered from the breakdowns by least squares rather than typed in, because it is a fixed rule; the fit residual is a data-quality
            check.
          </li>
          <li>
            <strong>Fouls.</strong> Foul points an alliance receives are charged to the <em>opposing</em> robots, so a foul-prone robot is penalised.
          </li>
        </ul>
        {spec ? (
          <p>
            {spec.year} ({spec.game}): {spec.components.map((c) => `${c.label} (${c.attribution})`).join(', ')}.{' '}
            {spec.generic ? 'This season has no game-specific spec, so only the non-foul total and fouls are modelled.' : ''}
          </p>
        ) : null}

        <h3>2. Credit is split jointly, with uncertainty</h3>
        <p>For each component c, an alliance observation is modelled as</p>
        <div className="eq">{'y = θ[r1,c] + θ[r2,c] + θ[r3,c] + ε,     ε ~ Normal(0, σ²_c)'}</div>
        <p>
          with a Normal prior on every θ. Within an event the posterior over all teams’ θ is computed <em>exactly</em> with full covariance (a static-state Kalman filter, which is
          Bayesian ridge regression updated one result at a time). This is what makes partner adjustment correct: scoring 90 points with two strong partners earns less credit
          than scoring 90 with two weak ones, and the uncertainty shared between partners is tracked, not ignored. The tests check that the sequential result equals the batch
          ridge-regression solution to 1e-9.
        </p>
        <h3>3. Between events, robots change</h3>
        <p>
          When a team arrives at a new event, its prior is its last posterior, shifted by the change in the season-wide average contribution since then, with extra variance
          (η = {DEFAULT_OPTIONS.eta} × the season’s robot spread) for rebuilds and repairs. A small per-match variance (q = {DEFAULT_OPTIONS.q}) lets estimates follow change
          within an event. A team at its first event starts from the season-wide average with the season-wide spread.
        </p>
        <h3>4. Season parameters come only from this season</h3>
        <p>
          The average contribution per robot (μ), the spread of true robot ability (τ) and match noise (σ) are re-estimated continuously, from results public at the time. σ is
          estimated without reference to the prior: within each event an unregularised least-squares fit is made and its residual variance pooled with a degrees-of-freedom
          correction (RSS / (N − p)). τ then follows from the observed spread of scores. (An earlier version estimated σ from forecast errors. It collapsed τ when the prior was
          too tight, because σ absorbed real differences between robots. The pooled estimator cannot do that.)
        </p>

        <h2>Forecasts</h2>
        <p>
          An alliance’s forecast score is the sum of its robots’ expected contributions across components, plus the foul points the opponents are expected to concede. Its
          uncertainty has two parts: parameter uncertainty (how well the robots are known, from the posterior covariance) and match noise. Match noise for totals and margins is
          estimated from the model’s own forecast errors, weighted by maximum likelihood, so the stated uncertainty is calibrated against reality rather than assumed.
        </p>
        <div className="eq">{'P(red wins) = Φ((μ_red − μ_blue − 0.5) / sd_margin),   P(tie) from the ±0.5 band'}</div>
        <p>
          Bonus ranking points are forecast with a logistic regression of each bonus on the predicted points of the components that drive it, fitted only on earlier matches. Win
          and tie RP values are read from the breakdowns’ <code>rp</code> field. Probabilities are shown as whole percents, and scores with an 80% range, because finer precision
          would be false.
        </p>
        <h3>Reliability</h3>
        <p>
          Reliability is kept separate from strength. <strong>Volatility</strong> is the observed squared forecast error of a team’s alliances divided by what the model expected,
          shrunk toward 1 (1.00 = as variable as forecast). Per-robot outcome rates (e.g. how often a robot reaches each climb level) are shown with Wilson 95% intervals. Posterior
          SD tells you how much data stands behind a number.
        </p>

        <h2>Playoffs and alliance selection</h2>
        <p>
          Brackets follow TBA’s <code>playoff_type</code>: 8- and 4-alliance double elimination, 8- and 4-alliance best-of-3 brackets, and best-of-3 or best-of-5 finals. Round
          robin, average-score and custom formats are not simulated; the event page says so. Series already played are fixed to their official results and partially played
          best-of-3 series keep their game count. 20,000 brackets are simulated from pairwise alliance win probabilities. A four-robot alliance is assumed to field its three
          highest-rated robots.
        </p>
        <p>
          Pick values simulate the rest of the draft (serpentine; other captains take the best available robot) and then the actual bracket. Candidates are ranked by
          the captain’s probability of winning the event, not by xPts. Qualification ranking projections simulate the remaining schedule 5,000 times.
        </p>

        <h2>Validation</h2>
        <p>Every season is evaluated on its own with a walk-forward procedure:</p>
        <ol>
          <li>Matches are processed in order of start time.</li>
          <li>Before a match is forecast, every result whose TBA <code>post_result_time</code> is at or before that match’s start is revealed, and nothing else. When TBA has no post time, a result is assumed public 5 minutes after the match started.</li>
          <li>The forecast is frozen and stored with its data cutoff and model version.</li>
          <li>The result is revealed later, at its own post time, and the model updates.</li>
        </ol>
        <p>
          This rules out future-match leakage, post-event leakage, final rankings informing earlier matches and playoff results informing qualifications. A test checks that no
          forecast saw any result posted after its match began. All models are scored on exactly the same matches. Metrics: log loss, Brier score, favourite accuracy, score
          MAE and RMSE, margin MAE, interval coverage, CRPS and calibration curves.
        </p>
        <p>
          <strong>On Statbotics:</strong> no claim of superiority is made. A fair comparison needs both systems’ forecasts frozen at the same time from the same information.
          Statbotics’ EPA deliberately uses prior-season information to set early-season priors, so its early forecasts have information this model refuses to use. A comparison
          would have to report early and late season separately.
        </p>

        <h2>Known limitations</h2>
        <ul>
          <li>Early-season forecasts are weak by design: with no prior-season information, the first matches of a season are excluded from validation until every component has data.</li>
          <li>Alliance components assume additive contributions. Interference between robots (shared game pieces, crowded scoring locations) appears as noise, not as an interaction.</li>
          <li>Defence is only partly observable from alliance totals. Each robot has a strongly shrunk “opponent suppression” term on defendable components (opponents’ teleop scoring). It measures any reduction in opponents’ scoring when the robot is on the field (defence played, but also field control and game rules that tie one alliance’s opportunities to the other’s), not defence alone. It was switched on in 1.1.0 after improving log loss and Brier in 2025 and again, out of sample, in 2026; the gain is small and the estimates are noisy, so read individual defence numbers with care.</li>
          <li>Robots that break mid-match are not identifiable from TBA data except through per-robot fields and DQ/surrogate flags.</li>
          <li>Playoff, alliance-selection and ad-hoc forecasts use stored per-team marginals; covariance between partners is not stored, which slightly overstates parameter uncertainty.</li>
          <li>Season parameters (η, q, half-lives) are fixed defaults until tuned on completed past seasons; tuning on the season being evaluated would leak.</li>
          <li>Per-game scoring specs exist for {SUPPORTED_GAME_YEARS.sort().join(', ')}; other seasons use a generic total-score model.</li>
          <li>Off-season events are not rated.</li>
        </ul>

        <h2>Model versions</h2>
        {history.length ? (
          <table className="agate" style={{ maxWidth: 640 }}>
            <thead>
              <tr>
                <th>Run</th>
                <th>Version</th>
                <th>Results through</th>
                <th className="n">Evaluated</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="n">{h.id}</td>
                  <td>{h.version}</td>
                  <td>{h.data_as_of ? stamp(h.data_as_of) : '—'}</td>
                  <td className="n">{h.evaluated.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">No model runs stored yet.</p>
        )}
        {run ? (
          <>
            <h2>Recovered rules, {year}</h2>
            <ul>
              <li>
                Win {run.rules.rp.win} RP, tie {run.rules.rp.tie} RP ({run.rules.rp.inferred ? `inferred from ${run.rules.rp.n} alliances` : 'default, not enough data to infer'})
              </li>
              {Object.entries(run.rules.categories).map(([cid, fit]) => (
                <li key={cid}>
                  {spec?.components.find((c) => c.id === cid)?.label}:{' '}
                  {Object.entries(fit.values)
                    .map(([k, v]) => `${k} = ${v}`)
                    .join(', ')}{' '}
                  <span className="muted">(fit RMSE {pts(fit.rmse, 2)} over {fit.n} alliances)</span>
                </li>
              ))}
              <li>
                Data quality: {run.quality.missingBreakdown} of {run.quality.alliances} alliance results had no breakdown; {run.quality.componentMismatch} had components not summing to
                the total.
              </li>
            </ul>
          </>
        ) : null}
      </article>
    </>
  );
}
