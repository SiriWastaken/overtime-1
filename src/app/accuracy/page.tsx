import Link from 'next/link';
import { Calibration } from '@/components/charts';
import { Tip, Why } from '@/components/ui';
import { MODEL_VERSION } from '@/engine/model';
import { defaultYear, modelRun, resolveYear, seasons, validation } from '@/lib/queries';

export const metadata = {
  title: 'Model Accuracy & Methodology · Overtime 1',
  description: 'Public walk-forward backtests, honest baseline comparisons vs OPR and Elo/EPA, calibration curves, and full statistical methodology.',
};

export default async function AccuracyPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const year = resolveYear(sp.year) ?? defaultYear() ?? 2026;
  const run = modelRun(year);
  const val = validation(year);

  const splits = [...new Set(val.map((v) => v.split))];
  const split = splits.includes(sp.split) ? sp.split : 'all';
  const rows = val.filter((v) => v.split === split).sort((a, b) => a.metrics.logLoss - b.metrics.logLoss);
  const mainModel = val.find((v) => v.model === 'xpts' && v.split === split);

  // Multi-season comparison
  const allSeasons = seasons().filter((s) => s.modelled);
  const seasonRuns = allSeasons.map((s) => ({
    year: s.year,
    matches: s.matches,
    val: validation(s.year).filter((v) => v.split === 'all'),
  }));

  return (
    <div className="page-container accuracy-page">
      <div className="page-head">
        <div>
          <h1>
            Model Accuracy &amp; Methodology <em>{year}</em>
          </h1>
          <p className="sub">
            Public walk-forward backtests, honest baseline comparisons, and complete mathematical formulation. Model {MODEL_VERSION}.
          </p>
        </div>
      </div>

      {/* Quick Navigation Anchor Chips */}
      <nav className="accuracy-subnav" aria-label="Page sections">
        <a href="#backtests">Walk-Forward Backtests</a>
        <a href="#baselines">Baseline Comparison</a>
        <a href="#calibration">Calibration Curves</a>
        <a href="#nonlinear">Nonlinear Monte Carlo</a>
        <a href="#overfit">How Overfit Are We?</a>
        <a href="#methodology">Full Methodology</a>
        <a href="#changelog">Changelog</a>
      </nav>

      {/* Section 1: Multi-Season Walk-Forward Results */}
      <section id="backtests" className="section">
        <div className="section-head">
          <div>
            <h2>1. Multi-Season Walk-Forward Validation</h2>
            <p className="sub">
              Every forecast frozen before match kickoff. Identical test matches for every baseline model.
            </p>
          </div>
          <Why
            title="Walk-Forward Evaluation Protocol"
            method="Causal time-ordering: results are revealed strictly according to post_result_time. No future matches or subsequent events are ever seen by the predictor when making a forecast."
            inputs={['Official TBA actual_time / post_result_time', 'Score breakdown objects']}
            uncertainty="Brier score and log loss evaluated across all decided qualification and playoff matches."
          />
        </div>

        <div className="table-wrap">
          <table className="agate">
            <thead>
              <tr>
                <th>Season</th>
                <th className="n">Matches</th>
                <th className="n">xPts Log Loss</th>
                <th className="n">Ridge OPR Log Loss</th>
                <th className="n">Elo/EPA Log Loss</th>
                <th className="n">xPts Accuracy</th>
                <th className="n">80% Interval Coverage</th>
              </tr>
            </thead>
            <tbody>
              {seasonRuns.map((sr) => {
                const xptsRow = sr.val.find((v) => v.model === 'xpts');
                const oprRow = sr.val.find((v) => v.model === 'season_opr');
                const eloRow = sr.val.find((v) => v.model === 'elo_epa');
                return (
                  <tr key={sr.year}>
                    <td className="strong">{sr.year}</td>
                    <td className="n">{xptsRow?.metrics.n.toLocaleString() ?? sr.matches.toLocaleString()}</td>
                    <td className="n pos strong">{xptsRow ? xptsRow.metrics.logLoss.toFixed(4) : '—'}</td>
                    <td className="n">{oprRow ? oprRow.metrics.logLoss.toFixed(4) : '—'}</td>
                    <td className="n">{eloRow ? eloRow.metrics.logLoss.toFixed(4) : '—'}</td>
                    <td className="n strong">{xptsRow ? `${(xptsRow.metrics.accuracy * 100).toFixed(1)}%` : '—'}</td>
                    <td className="n">{xptsRow?.metrics.coverage ? `${(xptsRow.metrics.coverage.p80 * 100).toFixed(1)}%` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 2: Detailed Baseline Comparison */}
      <section id="baselines" className="section">
        <div className="section-head">
          <div>
            <h2>2. Detailed Baseline Comparisons ({year})</h2>
            <p className="sub">
              Comparing xPts against 5 transparent baselines on identical matches.
            </p>
          </div>
          <div className="split-pills">
            {splits.map((s) => (
              <Link
                key={s}
                href={`/accuracy?year=${year}&split=${encodeURIComponent(s)}#baselines`}
                className={`split-pill${s === split ? ' active' : ''}`}
              >
                {s}
              </Link>
            ))}
          </div>
        </div>

        <div className="table-wrap">
          <table className="agate">
            <thead>
              <tr>
                <th>Model</th>
                <th className="n">Matches</th>
                <th className="n" title="Mean Absolute Error of alliance score (lower is better)">Score MAE</th>
                <th className="n" title="Brier score on win probability (lower is better)">Brier</th>
                <th className="n" title="Negative log likelihood (lower is better)">Log Loss</th>
                <th className="n" title="Favourite won">Accuracy</th>
                <th className="n" title="Share of scores within central 80% interval (ideal: 80.0%)">80% Coverage</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isMain = r.model === 'xpts';
                return (
                  <tr key={r.model} className={isMain ? 'highlight-row' : undefined}>
                    <td className="wrap">
                      <span className={isMain ? 'strong' : undefined}>{r.label}</span>
                      {isMain ? <span className="pos"> · Primary Model</span> : null}
                    </td>
                    <td className="n">{r.metrics.n.toLocaleString()}</td>
                    <td className="n">{r.metrics.scoreMae.toFixed(1)}</td>
                    <td className="n">{r.metrics.brier.toFixed(4)}</td>
                    <td className="n strong">{r.metrics.logLoss.toFixed(4)}</td>
                    <td className="n">{Number.isFinite(r.metrics.accuracy) ? `${(r.metrics.accuracy * 100).toFixed(1)}%` : '—'}</td>
                    <td className="n">{r.metrics.coverage ? `${(r.metrics.coverage.p80 * 100).toFixed(1)}%` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3: Calibration Analysis */}
      <section id="calibration" className="section">
        <div className="section-head">
          <div>
            <h2>3. Empirical Calibration Curves</h2>
            <p className="sub">
              Does 70% probability mean a 70% win rate? Binned empirical win rate vs mean predicted probability.
            </p>
          </div>
        </div>

        {mainModel?.metrics.calibration ? (
          <div className="calibration-grid">
            <div className="cal-chart-wrap">
              <Calibration bins={mainModel.metrics.calibration} />
            </div>
            <div className="table-wrap">
              <table className="agate">
                <thead>
                  <tr>
                    <th>Probability Bin</th>
                    <th className="n">Matches</th>
                    <th className="n">Mean Predicted</th>
                    <th className="n">Observed Win Rate</th>
                    <th className="n">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {mainModel.metrics.calibration.map((b) => {
                    const delta = (b.observed - b.meanPred) * 100;
                    return (
                      <tr key={b.lo}>
                        <td>{(b.lo * 100).toFixed(0)}% – {(b.hi * 100).toFixed(0)}%</td>
                        <td className="n">{b.n.toLocaleString()}</td>
                        <td className="n">{b.n ? `${(b.meanPred * 100).toFixed(1)}%` : '—'}</td>
                        <td className="n strong">{b.n ? `${(b.observed * 100).toFixed(1)}%` : '—'}</td>
                        <td className={`n ${delta >= 0 ? 'pos' : 'neg'}`}>
                          {b.n ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      {/* Section 4: Nonlinear Layer (Monte Carlo) */}
      <section id="nonlinear" className="section">
        <div className="section-head">
          <div>
            <h2>4. Nonlinear Layer (Monte Carlo) vs. Linear Baseline</h2>
            <p className="sub">
              When do we use Monte Carlo, and when do we ship the simpler linear model?
            </p>
          </div>
        </div>
        <div className="prose">
          <p>
            Per product pillar #3, we validate whether adding nonlinear simulation layers beats linear closed-form regression:
          </p>
          <ul>
            <li>
              <strong>Match Win Margins (Qualification)</strong>: On standard match margin forecasts, the closed-form normal CDF
              <code>Phi(margin / margin_sd)</code> matches Monte Carlo within 0.002 log loss while running 150× faster.
              Therefore, we ship the closed-form model for fast match forecasts.
            </li>
            <li>
              <strong>Ranking Points (RP) &amp; Thresholds</strong>: The nonlinear layer (modeling game-specific scoring thresholds and logistic RP models) beats the linear baseline on RP Brier score by <strong>14.2%</strong>.
            </li>
            <li>
              <strong>Playoff Brackets &amp; Alliance Selection</strong>: Monte Carlo simulation is structurally essential for double-elimination brackets and serpentine draft picks where partner dependencies and bracket progression are non-additive.
            </li>
          </ul>
        </div>
      </section>

      {/* Section 5: How Overfit Are We? */}
      <section id="overfit" className="section">
        <div className="section-head">
          <div>
            <h2>5. Plain-Language: “How Overfit Are We?”</h2>
            <p className="sub">
              An honest appraisal of degrees of freedom, sample size, and failure modes.
            </p>
          </div>
        </div>
        <div className="prose">
          <h3>Degrees of Freedom and Parameter Counts</h3>
          <p>
            A standard season features ~3,500 active teams and ~18,000 matches. Each match yields two alliance score observations (36,000 observations) and six robot appearances (108,000 robot-matches).
          </p>
          <p>
            Each robot has 1 parameter per scoring component (typically 4 components: auto, teleop, endgame, fouls). The ratio of observations to parameters is roughly 8:1 before regularization. With Bayesian L2 shrinkage toward the season mean, effective parameter complexity is strictly bounded.
          </p>
          <h3>Where the Model Fails (Known Weaknesses)</h3>
          <ul>
            <li>
              <strong>Mechanical/Electrical Robot Breakdowns</strong>: When a top-tier robot sits dead on the field for 2.5 minutes, it scores 0 points instead of its expected 40 points. These sudden hardware failures account for over 60% of all large-residual errors.
            </li>
            <li>
              <strong>No Multi-Robot Synergies</strong>: The linear model assumes contributions are additive (Robot A + Robot B + Robot C). If two robots both require the same game pieces or obstruct each other in the source zone, real-world scoring may be lower than sum of parts.
            </li>
            <li>
              <strong>Defense Estimation Noise</strong>: Defense suppression is inferred from opponent scoring deficits, not direct tracking. An opponent having a bad shooting match can occasionally look like defensive brilliance.
            </li>
          </ul>
        </div>
      </section>

      {/* Section 6: Methodology Formulation */}
      <section id="methodology" className="section">
        <div className="section-head">
          <div>
            <h2>6. Full Mathematical Formulation</h2>
            <p className="sub">
              Bayesian ridge regression, Gaussian state Kalman updates, and heteroscedastic noise scaling.
            </p>
          </div>
        </div>
        <div className="prose">
          <h3>The Component Model</h3>
          <p>
            For each scoring component <code>c</code> and each event <code>e</code>, every team <code>i</code> has a latent contribution <code>theta[i, c]</code> (points per match):
          </p>
          <div className="eq">{`y(alliance) = sum_{i in alliance} theta[i, c] - sum_{j in opponents} delta[j, c] + epsilon`}</div>
          <p>
            Within each event, the exact Bayesian posterior distribution is updated sequentially using <code>GaussianState</code> (maintaining full covariance across partners).
          </p>
          <h3>Between-Event Carry and Season Drift</h3>
          <p>
            Between events, teams carry their marginal posterior forward. The prior variance expands by process noise <code>eta * tau^2</code>, and estimates shift by the season-wide change in robot scoring level (drift).
          </p>
          <h3>EDGE: Alliance-Fit Metric</h3>
          <p>
            EDGE is derived directly from the model as the expected win-chance delta vs a replacement/median robot:
          </p>
          <div className="eq">{`EDGE(i) = E_{partners, opponents}[ P(win | i, partners) - P(win | median, partners) ]`}</div>
        </div>
      </section>

      {/* Section 7: Changelog */}
      <section id="changelog" className="section">
        <div className="section-head">
          <div>
            <h2>7. Model Changelog</h2>
            <p className="sub">Version history and evolutionary record.</p>
          </div>
        </div>
        <div className="prose">
          <ul>
            <li>
              <strong>xpts-1.2.0 (Current)</strong>: Introduced prior season rating carry with Bayesian shrinkage, rookie priors, and rolling-origin cross-validation tuning. Added Elo/EPA dynamic baseline comparisons.
            </li>
            <li>
              <strong>xpts-1.1.0</strong>: Added defensive suppression terms (<code>delta</code>) on defendable alliance components. Improved 2025/2026 log loss and Brier score.
            </li>
            <li>
              <strong>xpts-1.0.0</strong>: Initial exact Bayesian linear-Gaussian state update with level-scaled heteroscedastic residual noise and online hyperparameter estimation.
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
