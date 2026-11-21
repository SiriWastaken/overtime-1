import { Fragment } from 'react';
import { Tip } from '@/components/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Empty, TeamLink } from '@/components/bits';
import { LineScore } from '@/components/LineScore';
import { seasonSpec } from '@/engine/seasons';
import { matchLabel, pct, pts, stamp } from '@/lib/format';
import { event, match, modelRun, teamMetaMap } from '@/lib/queries';

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  return { title: (await params).key };
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

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{matchLabel(m)}</h1>
          <div className="sub">
            <Link href={`/events/${m.eventKey}`}>{ev?.name ?? m.eventKey}</Link>
            {m.actualTime ? ` · played ${stamp(m.actualTime)}` : m.time ? ` · scheduled ${stamp(m.time)}` : ''}
          </div>
        </div>
      </div>
      <LineScore m={m} year={m.year} link={false} title="Line score" />
      {!f ? (
        <Empty>
          <strong>No forecast.</strong>
          Off-season or not rated yet.
        </Empty>
      ) : (
        <>
          <section className="section">
              <div className="section-head">
                <h2>Robot contributions</h2>
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
                  Rating doubt <Tip label="What is rating doubt?">Share of the uncertainty from not knowing the robots well yet. The rest is match noise.</Tip>
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
            <dt>Forecast</dt>
            <dd>{m.prediction!.kind === 'pre_match' ? 'Frozen at match start (walk-forward)' : 'Live: uses all results so far'}</dd>
            <dt>Data cutoff</dt>
            <dd>{m.prediction!.cutoff ? `Results public by ${stamp(m.prediction!.cutoff)}` : 'Start of season'}</dd>
            <dt>Model</dt>
            <dd>
              {run?.version ?? '—'} · run {run?.id ?? '—'}
            </dd>
          </dl>
        </>
      )}
    </>
  );
}
