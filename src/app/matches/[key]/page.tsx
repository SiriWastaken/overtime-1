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
        <Empty>No forecast is stored for this match (the event may not be an official event, or the season has not been modelled).</Empty>
      ) : (
        <>
          <section className="section">
              <div className="section-head">
                <h2>Robot contributions</h2>
                <span className="note">expected points per match, as known at forecast time</span>
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
                        Opp. supp.
                      </th>
                      <th className="n">Fouls given</th>
                      <th className="n">±SD</th>
                      <th className="n">Prior matches</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(['red', 'blue'] as const).map((c) =>
                      f[c].teams.map((t) => (
                        <tr key={t.team} className={c === 'red' ? '' : ''}>
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
              <ul className="prose" style={{ fontSize: 13.5, paddingLeft: 18, margin: 0 }}>
                <li>
                  Expected margin {f.margin >= 0 ? 'Red' : 'Blue'} by <strong>{pts(Math.abs(f.margin), 0)}</strong> points, with an SD of {pts(f.marginSd, 0)}. So{' '}
                  {f.margin >= 0 ? 'Red' : 'Blue'} wins {pct(Math.max(f.redWinProb, 1 - f.redWinProb))} of the time
                  {f.tieProb >= 0.005 ? `; a tie is ${pct(f.tieProb)}` : ''}.
                </li>
                {factors.map(({ c, gap }) => (
                  <li key={c.id}>
                    {c.label}: <span className={gap > 0 ? 'red-t' : 'blue-t'}>{gap > 0 ? 'Red' : 'Blue'}</span> +{pts(Math.abs(gap), 1)}
                    {c.attribution === 'opponent' ? ' (foul points the opponents are expected to give away)' : c.attribution === 'robot' ? ' (from per-robot records)' : ''}
                  </li>
                ))}
                <li>
                  {Math.round(paramShare * 100)}% of the margin’s uncertainty is from not knowing the robots well yet; the rest is ordinary match-to-match noise
                  {thinnest ? `. Least data: ${thinnest.team.slice(3)} with ${thinnest.matches} prior matches` : ''}.
                </li>
                {!f.eligible ? <li>Too early in the season for an informed forecast; excluded from validation.</li> : null}
              </ul>
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
