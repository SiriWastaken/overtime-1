import { Fragment } from 'react';
import { Tip, Why } from '@/components/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Empty, TeamLink } from '@/components/bits';
import { LineScore } from '@/components/LineScore';
import { seasonSpec } from '@/engine/seasons';
import { matchLabel, pct, pts, stamp } from '@/lib/format';
import { event, match, modelRun, teamMetaMap } from '@/lib/queries';

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const m = match(key);
  return { title: m ? `${matchLabel(m)} · Overtime 1` : 'Match' };
}

export default async function MatchPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const m = match(key);
  if (!m) notFound();
  const ev = event(m.eventKey);
  const run = modelRun(m.year);
  const spec = seasonSpec(m.year);
  const f = m.prediction?.forecast;
  const meta = teamMetaMap([...m.red, ...m.blue]);

  // Key factors: component-level gaps between the alliances, largest first.
  const factors = f
    ? spec.components
        .map((c) => ({ c, gap: (f.red.components[c.id] ?? 0) - (f.blue.components[c.id] ?? 0) }))
        .filter((x) => Math.abs(x.gap) >= 0.5)
        .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
        .slice(0, 4)
    : [];
  const paramShare = f ? f.marginParamVar / (f.marginSd * f.marginSd) : 0;
  const thinnest = f ? [...f.red.teams, ...f.blue.teams].sort((a, b) => a.matches - b.matches)[0] : null;

  // Model vs Reality calculations if played
  const isPlayed = m.redScore !== null && m.blueScore !== null;
  const redErr = isPlayed && f ? m.redScore! - f.red.mean : null;
  const blueErr = isPlayed && f ? m.blueScore! - f.blue.mean : null;
  const actualMargin = isPlayed ? m.redScore! - m.blueScore! : null;
  const predMargin = f ? f.margin : null;
  const marginErr = isPlayed && predMargin !== null && actualMargin !== null ? actualMargin - predMargin : null;
  const upset = isPlayed && f && ((f.redWinProb > 0.55 && m.winner === 'blue') || (f.redWinProb < 0.45 && m.winner === 'red'));

  return (
    <div className="page-container match-page">
      <div className="page-head">
        <div>
          <h1>{matchLabel(m)}</h1>
          <div className="sub">
            <Link href={`/events/${m.eventKey}`}>{ev?.name ?? m.eventKey}</Link>
            {m.actualTime ? ` · played ${stamp(m.actualTime)}` : m.time ? ` · scheduled ${stamp(m.time)}` : ''}
          </div>
        </div>
        {f ? (
          <Why
            title="Match Forecast Formulation"
            value={`Red ${Math.round(f.redWinProb * 100)}% · Blue ${Math.round((1 - f.redWinProb) * 100)}%`}
            inputs={[
              `Red alliance mean: ${f.red.mean.toFixed(1)} pts (SD: ${f.red.sd.toFixed(1)})`,
              `Blue alliance mean: ${f.blue.mean.toFixed(1)} pts (SD: ${f.blue.sd.toFixed(1)})`,
              `Predicted margin: ${f.margin >= 0 ? '+' : ''}${f.margin.toFixed(1)} pts (SD: ${f.marginSd.toFixed(1)})`,
              `Data cutoff: ${stamp(m.prediction?.cutoff ?? 0)}`,
            ]}
            method="Bayesian Gaussian state evaluation prior to kickoff. Component estimates are additive with partner covariance; win probability uses closed-form normal CDF Phi(margin / margin_sd)."
            uncertainty={`80% score interval: Red [${f.red.lo80.toFixed(0)}, ${f.red.hi80.toFixed(0)}], Blue [${f.blue.lo80.toFixed(0)}, ${f.blue.hi80.toFixed(0)}]`}
          />
        ) : null}
      </div>

      <LineScore m={m} year={m.year} link={false} title="Line score" />

      {/* Signature Moment: Model vs Reality Reveal */}
      {isPlayed && f ? (
        <section className={`section model-vs-reality-box${upset ? ' upset' : ''}`} aria-labelledby="mvr-head">
          <div className="section-head">
            <h2 id="mvr-head">Model vs. Reality Reveal</h2>
            {upset ? <span className="upset-badge">⚡ UPSET ALERT</span> : null}
          </div>
          <div className="mvr-grid">
            <div className="mvr-card">
              <span className="mvr-k">PREDICTED WINNER</span>
              <span className="mvr-val">
                {f.redWinProb >= 0.5 ? 'Red Alliance' : 'Blue Alliance'} (
                {(Math.max(f.redWinProb, 1 - f.redWinProb) * 100).toFixed(0)}%)
              </span>
              <span className="muted">Expected Margin: {f.margin >= 0 ? '+' : ''}{f.margin.toFixed(1)} pts</span>
            </div>
            <div className="mvr-card">
              <span className="mvr-k">ACTUAL WINNER</span>
              <span className="mvr-val strong">
                {m.winner === 'red' ? 'Red Alliance' : m.winner === 'blue' ? 'Blue Alliance' : 'Tie'}
              </span>
              <span className="muted">Actual Margin: {actualMargin! >= 0 ? `+${actualMargin}` : actualMargin} pts</span>
            </div>
            <div className="mvr-card">
              <span className="mvr-k">WHAT THE MODEL GOT WRONG</span>
              <span className="mvr-val">
                {Math.abs(marginErr!) <= 6 ? (
                  <span className="pos">Bullseye (within 6 pts)</span>
                ) : (
                  <span>
                    Margin off by {Math.abs(marginErr!).toFixed(1)} pts
                  </span>
                )}
              </span>
              <span className="muted">
                Red: {redErr! >= 0 ? `+${redErr!.toFixed(1)}` : redErr!.toFixed(1)} pts · Blue: {blueErr! >= 0 ? `+${blueErr!.toFixed(1)}` : blueErr!.toFixed(1)} pts
              </span>
            </div>
          </div>
        </section>
      ) : null}

      {!f ? (
        <Empty>
          <strong>No forecast.</strong>
          Off-season or not rated yet.
        </Empty>
      ) : (
        <>
          <section className="section">
            <div className="section-head">
              <h2>Robot Contributions</h2>
              <Tip label="About these numbers">Expected points per match, as known before this match.</Tip>
            </div>
            <div className="table-wrap">
              <table className="agate">
                <thead>
                  <tr>
                    <th>Robot</th>
                    {spec.components
                      .filter((c) => c.attribution !== 'opponent')
                      .map((c) => (
                        <th key={c.id} className="n hide-m">
                          {c.label}
                        </th>
                      ))}
                    <th className="n">Scoring</th>
                    <th className="n" title="Expected reduction in opponents' scoring">
                      Defense
                    </th>
                    <th className="n">Fouls given</th>
                    <th className="n">±SD</th>
                    <th className="n">Prior matches</th>
                  </tr>
                </thead>
                <tbody>
                  {(['red', 'blue'] as const).map((c) =>
                    f[c].teams.map((t) => (
                      <tr key={t.team} data-peek={t.team} data-year={m.year}>
                        <td>
                          <span className="side">
                            <span className={`swatch ${c}`} />
                            <span className="sr-only">{c === 'red' ? 'Red' : 'Blue'} alliance:</span>
                            <TeamLink team={t.team} meta={meta.get(t.team)} year={m.year} />
                          </span>
                        </td>
                        {spec.components
                          .filter((x) => x.attribution !== 'opponent')
                          .map((x) => (
                            <td key={x.id} className="n hide-m">
                              {pts(t.components[x.id], 1)}
                            </td>
                          ))}
                        <td className="n strong">{pts(t.total, 1)}</td>
                        <td className="n muted">{pts(t.defense, 1)}</td>
                        <td className="n muted">{pts(t.fouls, 1)}</td>
                        <td className="n muted">{pts(t.sd, 1)}</td>
                        <td className="n muted">{t.matches}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid-2">
            <section className="section">
              <div className="section-head">
                <h2>Why this forecast</h2>
              </div>
              <dl className="kv glass">
                <dt>Margin</dt>
                <dd>
                  <span className={f.margin >= 0 ? 'red-t' : 'blue-t'}>{f.margin >= 0 ? 'Red' : 'Blue'}</span> +{pts(Math.abs(f.margin), 0)}{' '}
                  <span className="muted">± {pts(f.marginSd, 0)}</span>
                </dd>
                <dt>Win chance</dt>
                <dd>
                  {pct(Math.max(f.redWinProb, 1 - f.redWinProb))}
                  {f.tieProb >= 0.005 ? <span className="muted"> · tie {pct(f.tieProb)}</span> : null}
                </dd>
                {factors.map(({ c, gap }) => (
                  <Fragment key={c.id}>
                    <dt>{c.label}</dt>
                    <dd>
                      <span className={gap > 0 ? 'red-t' : 'blue-t'}>{gap > 0 ? 'Red' : 'Blue'}</span> +{pts(Math.abs(gap), 1)}
                    </dd>
                  </Fragment>
                ))}
                <dt>
                  Rating doubt <Tip label="What is rating doubt?">Share of uncertainty from not knowing robots well yet. Rest is match noise.</Tip>
                </dt>
                <dd>
                  {Math.round(paramShare * 100)}%{thinnest ? <span className="muted"> · least data: {thinnest.team.slice(3)} ({thinnest.matches} matches)</span> : null}
                </dd>
                {!f.eligible ? (
                  <>
                    <dt>Note</dt>
                    <dd>Too early in the season; not scored.</dd>
                  </>
                ) : null}
              </dl>

              {f.red.rp || f.blue.rp ? (
                <table className="agate" style={{ marginTop: 12 }}>
                  <thead>
                    <tr>
                      <th>Ranking points</th>
                      <th className="n">Red</th>
                      <th className="n">Blue</th>
                      {m.breakdown ? <th className="n">Actual</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Win</td>
                      <td className="n">{pct(f.red.rp?.win)}</td>
                      <td className="n">{pct(f.blue.rp?.win)}</td>
                      {m.breakdown ? <td className="n muted">{m.winner === 'tie' ? 'tie' : m.winner ?? ''}</td> : null}
                    </tr>
                    {spec.bonuses.map((b) => (
                      <tr key={b.key}>
                        <td>{b.label} bonus</td>
                        <td className="n">{pct(f.red.rp?.bonuses[b.key])}</td>
                        <td className="n">{pct(f.blue.rp?.bonuses[b.key])}</td>
                        {m.breakdown ? (
                          <td className="n muted">
                            {[m.breakdown.red[b.key] ? 'R' : '', m.breakdown.blue[b.key] ? 'B' : ''].filter(Boolean).join(' ') || 'none'}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                    <tr>
                      <td className="strong">Expected RP</td>
                      <td className="n strong">{f.red.rp?.expected.toFixed(1)}</td>
                      <td className="n strong">{f.blue.rp?.expected.toFixed(1)}</td>
                      {m.breakdown ? (
                        <td className="n muted">
                          {String(m.breakdown.red.rp ?? '—')}–{String(m.breakdown.blue.rp ?? '—')}
                        </td>
                      ) : null}
                    </tr>
                  </tbody>
                </table>
              ) : null}
            </section>
          </div>

          <dl className="kv">
            <dt>Forecast status</dt>
            <dd>{m.prediction!.kind === 'pre_match' ? 'Frozen at match start (walk-forward)' : 'Live: uses all results so far'}</dd>
            <dt>Data cutoff</dt>
            <dd>{m.prediction!.cutoff ? `Results public by ${stamp(m.prediction!.cutoff)}` : 'Start of season'}</dd>
            <dt>Model version</dt>
            <dd>
              {run?.version ?? '—'} · run {run?.id ?? '—'}
            </dd>
          </dl>
        </>
      )}
    </div>
  );
}
