import Link from 'next/link';
import { NoData } from '@/components/bits';
import { Calibration, Histogram } from '@/components/charts';
import { phaseRating, PHASE_COLS } from '@/components/RatingsTable';
import { seasonSpec } from '@/engine/seasons';
import { pct, pct1, pts } from '@/lib/format';
import { modelRun, resolveYear, seasons, teamRatings, validation } from '@/lib/queries';

export const metadata = { title: 'Analytics' };

export default async function Analytics({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const year = resolveYear(sp.year);
  const run = year ? modelRun(year) : null;
  if (!year || !run) return <NoData year={year} />;
  const spec = seasonSpec(year);
  const val = validation(year);
  const order = (s: string) => (s === 'all' ? 0 : s === 'qual' ? 1 : s === 'playoff' ? 2 : 3);
  const splits = [...new Set(val.map((v) => v.split))].sort((a, b) => order(a) - order(b) || a.localeCompare(b, 'en', { numeric: true }));
  const split = splits.includes(sp.split) ? sp.split : 'all';
  const rows = val.filter((v) => v.split === split).sort((a, b) => a.metrics.logLoss - b.metrics.logLoss);
  const main = val.find((v) => v.model === 'xpts' && v.split === split);
  const weeks = val.filter((v) => v.model === 'xpts' && !['all', 'qual', 'playoff'].includes(v.split)).sort((a, b) => a.split.localeCompare(b.split, 'en', { numeric: true }));
  const { rows: teams } = teamRatings(year);
  const phases = PHASE_COLS.filter((p) => spec.components.some((c) => c.phase === p.id));
  const phaseVals = phases.map((p) => ({ p, v: teams.filter((t) => t.rating.matches >= 3).map((t) => phaseRating(year, t.rating, p.id).mean) }));
  const shared = Math.ceil(Math.max(1, ...phaseVals.flatMap((x) => x.v)));
  const others = seasons().filter((s) => s.modelled && s.year !== year);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Analytics, {year}</h1>
          <div className="sub">
            Walk-forward validation: every forecast is made at match start from results public by then. All models are scored on the same {run.evaluated.toLocaleString()} matches;{' '}
            {run.excluded.notEligible} early-season matches before the model had enough data are excluded for every model alike.
          </div>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Model comparison</h2>
          <nav className="note" aria-label="Split">
            {splits.map((s, i) => (
              <span key={s}>
                {i ? ' · ' : ''}
                {s === split ? <strong>{s}</strong> : <Link href={`/analytics?year=${year}&split=${encodeURIComponent(s)}`}>{s}</Link>}
              </span>
            ))}
          </nav>
        </div>
        <div className="table-wrap">
          <table className="agate">
            <thead>
              <tr>
                <th>Model</th>
                <th className="n">Matches</th>
                <th className="n" title="Lower is better">
                  Log loss
                </th>
                <th className="n" title="Lower is better">
                  Brier
                </th>
                <th className="n">Favourite won</th>
                <th className="n" title="Alliance score mean absolute error">
                  Score MAE
                </th>
                <th className="n">Score RMSE</th>
                <th className="n">Margin MAE</th>
                <th className="n" title="Share of alliance scores inside the 80% predictive interval (target 80%)">
                  80% coverage
                </th>
                <th className="n" title="Continuous ranked probability score of the score distribution (lower is better)">
                  CRPS
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.model}>
                  <td className={v.model === 'xpts' ? 'strong' : ''}>
                    {v.label}
                    {v.model.startsWith('xpts_') ? <span className="muted"> · ablation</span> : null}
                  </td>
                  <td className="n">{v.metrics.n.toLocaleString()}</td>
                  <td className="n strong">{v.metrics.logLoss.toFixed(4)}</td>
                  <td className="n">{v.metrics.brier.toFixed(4)}</td>
                  <td className="n">{pct1(v.metrics.accuracy)}</td>
                  <td className="n">{pts(v.metrics.scoreMae, 1)}</td>
                  <td className="n">{pts(v.metrics.scoreRmse, 1)}</td>
                  <td className="n">{pts(v.metrics.marginMae, 1)}</td>
                  <td className="n">{v.metrics.coverage ? pct1(v.metrics.coverage.p80) : '—'}</td>
                  <td className="n">{v.metrics.crps !== null ? v.metrics.crps.toFixed(2) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Sorted by log loss. Baselines: season average (always 50%), each team’s average alliance score, ridge-regularised OPR on total score (season-long and event-only). Ablations
          switch one part of xPts on or off. No comparison with Statbotics is claimed here; see Methodology.
        </p>
      </section>

      <div className="grid-2">
        <section className="section">
          <div className="section-head">
            <h2>Calibration</h2>
            <span className="note">{split}</span>
          </div>
          {main ? (
            <div className="figure" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <Calibration bins={main.metrics.calibration} />
              <table className="agate" style={{ width: 'auto', alignSelf: 'flex-start' }}>
                <thead>
                  <tr>
                    <th>Forecast</th>
                    <th className="n">Matches</th>
                    <th className="n">Red won</th>
                  </tr>
                </thead>
                <tbody>
                  {main.metrics.calibration
                    .filter((b) => b.n)
                    .map((b) => (
                      <tr key={b.lo}>
                        <td>
                          {Math.round(b.lo * 100)}–{Math.round(b.hi * 100)}%
                        </td>
                        <td className="n">{b.n}</td>
                        <td className="n">{pct(b.observed)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {main?.metrics.coverage ? (
            <p style={{ fontSize: 13, marginTop: 8 }}>
              Score intervals: {pct1(main.metrics.coverage.p50)} of alliance scores fell in the 50% interval, {pct1(main.metrics.coverage.p80)} in the 80% interval and{' '}
              {pct1(main.metrics.coverage.p95)} in the 95% interval.
            </p>
          ) : null}
        </section>
        <section className="section">
          <div className="section-head">
            <h2>By week</h2>
          </div>
          <table className="agate">
            <thead>
              <tr>
                <th>Week</th>
                <th className="n">Matches</th>
                <th className="n">Favourite won</th>
                <th className="n">Brier</th>
                <th className="n">80% coverage</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.split}>
                  <td>{w.split}</td>
                  <td className="n">{w.metrics.n}</td>
                  <td className="n">{pct1(w.metrics.accuracy)}</td>
                  <td className="n">{w.metrics.brier.toFixed(4)}</td>
                  <td className="n">{w.metrics.coverage ? pct1(w.metrics.coverage.p80) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>How robots score</h2>
          <span className="note">teams with ≥3 matches · all panels share one x-axis (0–{shared} xPts)</span>
        </div>
        <div className="grid-3">
          {phaseVals.map(({ p, v }) => (
            <div className="figure" key={p.id}>
              <Histogram values={v} xLabel={`${p.label} xPts`} lo={0} hi={shared} bins={24} height={170} width={400} />
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Season parameters</h2>
          <span className="note">estimated online from {year} results only</span>
        </div>
        <table className="agate">
          <thead>
            <tr>
              <th>Component</th>
              <th className="n">Observations</th>
              <th className="n" title="Season-wide average contribution per robot">
                Level per robot
              </th>
              <th className="n" title="Spread of true robot contributions">
                Robot spread (SD)
              </th>
              <th className="n" title="Match-to-match noise per observation">
                Noise (SD)
              </th>
            </tr>
          </thead>
          <tbody>
            {spec.components.map((c) => {
              const h = run.hyper.components[c.id];
              return h ? (
                <tr key={c.id}>
                  <td>{c.label}</td>
                  <td className="n">{h.n.toLocaleString()}</td>
                  <td className="n">{pts(h.mu, 1)}</td>
                  <td className="n">{pts(h.tau, 1)}</td>
                  <td className="n">{pts(h.sigma, 1)}</td>
                </tr>
              ) : null;
            })}
          </tbody>
        </table>
      </section>

      {others.length ? (
        <section className="section">
          <div className="section-head">
            <h2>Historical research</h2>
            <span className="note">other seasons, each modelled in isolation; nothing here feeds {year} ratings</span>
          </div>
          <table className="agate">
            <thead>
              <tr>
                <th>Season</th>
                <th className="n">Matches</th>
                <th className="n">Favourite won</th>
                <th className="n">Log loss</th>
                <th className="n">80% coverage</th>
              </tr>
            </thead>
            <tbody>
              {others.map((s) => {
                const v = validation(s.year).find((x) => x.model === 'xpts' && x.split === 'all');
                return (
                  <tr key={s.year}>
                    <td>
                      <Link href={`/analytics?year=${s.year}`}>{s.year}</Link>
                    </td>
                    <td className="n">{s.matches.toLocaleString()}</td>
                    <td className="n">{v ? pct1(v.metrics.accuracy) : '—'}</td>
                    <td className="n">{v ? v.metrics.logLoss.toFixed(4) : '—'}</td>
                    <td className="n">{v?.metrics.coverage ? pct1(v.metrics.coverage.p80) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}
