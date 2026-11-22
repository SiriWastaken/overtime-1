import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Avatar, Empty, RangeBar, TeamLink, WinBar } from '@/components/bits';
import { Histogram, RatingChart } from '@/components/charts';
import { phaseRating, PHASE_COLS } from '@/components/RatingsTable';
import { EdgeGauge, edgePts, hot } from '@/components/edge';
import { Celebrate } from '@/components/Celebrate';
import { MyTeamButton, PicklistButton, Tip } from '@/components/ui';
import { seasonSpec } from '@/engine/seasons';
import { seasonEdges } from '@/lib/edge';
import { wilson } from '@/engine/stats';
import { dateRange, location, matchLabel, pct, pts } from '@/lib/format';
import { modelRun, resolveYear, similarTeams, teamEvents, teamHistory, teamMatches, teamMeta, teamRating, teamRatings, teamYears } from '@/lib/queries';

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }) {
  return { title: `Team ${(await params).number}` };
}

export default async function TeamPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<Record<string, string>> }) {
  const { number } = await params;
  if (!/^\d{1,5}$/.test(number)) notFound();
  const key = `frc${number}`;
  const meta = teamMeta(key);
  const years = teamYears(key);
  const year = Number((await searchParams).year) || resolveYear(undefined) || years[0];
  if (!meta && years.length === 0) notFound();
  const spec = seasonSpec(year);
  const rated = teamRating(year, key);
  const run = modelRun(year);
  const hist = teamHistory(year, key);
  const evs = teamEvents(year, key);
  const matches = teamMatches(year, key);
  const all = rated ? teamRatings(year).rows : [];
  const r = rated?.rating;
  const se = r ? seasonEdges(year) : null;
  const edge = se?.byTeam.get(key) ?? null;
  const similar = r ? similarTeams(year, key, 5) : [];
  // a real milestone: the deciding final of the team's latest event went its way
  const lastEv = [...evs].reverse().find((e) => matches.some((mm) => mm.eventKey === e.key));
  const lastFinal = matches.filter((mm) => mm.eventKey === lastEv?.key && mm.compLevel === 'f' && mm.winner).sort((p, q) => (p.time ?? 0) - (q.time ?? 0)).at(-1);
  const wonLast = lastFinal && lastEv && (lastFinal.winner === 'red' ? lastFinal.red : lastFinal.blue).includes(key) ? lastEv : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            <Avatar team={number} year={year} size={40} />
            <span className={`team-num${hot(edge?.rank)}`}>{number}</span>{' '}
            <em>{meta?.nickname ?? ''}</em>
          </h1>
          <div className="sub">
            {meta ? location(meta) : 'Unknown origin'}
            {meta?.rookie_year ? ` · since ${meta.rookie_year}` : ''}
            {` · ${year} season`}
          </div>
        </div>
        {r ? (
          <div className="actions">
            <PicklistButton team={key} year={year} />
            <MyTeamButton team={key} />
          </div>
        ) : null}
      </div>

      {!r ? (
        <Empty>
          <strong>Still in the pits.</strong>
          {run ? `No official ${year} matches for ${number}.` : `${year} isn’t rated yet.`}
        </Empty>
      ) : (
        <>
          <section className="hero-team" aria-label={`Team ${number} rating`}>
            <div className="ht-number">
              {edge ? (
                <>
                  <span className="ht-label">EDGE · win-chance points vs a median robot</span>
                  <b className={`ht-big${edge.edge < 0 ? ' neg' : ''}`}>{edgePts(edge.edge)}</b>
                  <EdgeGauge edge={edge.edge} lo={edge.lo80} hi={edge.hi80} matches={edge.matches} size="lg" />
                  <span className="ht-range">
                    80% sure it sits between {edgePts(edge.lo80)} and {edgePts(edge.hi80)} · #{edge.rank.toLocaleString()} of {rated!.total.toLocaleString()}
                  </span>
                </>
              ) : (
                <>
                  <span className="ht-label">Points added per match</span>
                  <b className="ht-big">{r.net.toFixed(1)}</b>
                  <span className="ht-range">Too few matches for EDGE yet.</span>
                </>
              )}
              {wonLast ? <Celebrate id={`${key}-${wonLast.key}`}>Won {wonLast.short_name || wonLast.name}. Nobody panic.</Celebrate> : null}
            </div>
            <aside className="ht-why card" aria-labelledby="why-h">
              <h2 id="why-h">Why this number</h2>
              <dl>
                <div>
                  <dt>Inputs</dt>
                  <dd>
                    {r.matches} matches at {r.events.length} event{r.events.length === 1 ? '' : 's'}, this season only. Adds {r.net.toFixed(1)} points a match (auto {phaseRating(year, r, 'auto').mean.toFixed(1)}, teleop{' '}
                    {phaseRating(year, r, 'teleop').mean.toFixed(1)}, endgame {phaseRating(year, r, 'endgame').mean.toFixed(1)}
                    {r.defense ? `, defense ${r.defense.mean.toFixed(1)}` : ''}), gives away {(r.fouls?.mean ?? 0).toFixed(1)} in fouls.
                  </dd>
                </div>
                <div>
                  <dt>Method</dt>
                  <dd>Each match updates every robot’s estimate, splitting alliance points by what partners usually score. EDGE turns points into win chance against realistic partners and opponents.</dd>
                </div>
                <div>
                  <dt>Uncertainty</dt>
                  <dd>
                    ±{r.total.sd.toFixed(1)} points a match.{edge && edge.matches < 8 ? ' Early: fewer than 8 matches.' : ''} This number is 80% sure of itself.
                  </dd>
                </div>
              </dl>
              <Link href="/methodology">How it works</Link>
            </aside>
          </section>

          <div className="grid-2">
            <section className="section">
              <div className="section-head">
                <h2>Points added, match by match</h2>
                <Tip label="About this chart">Estimate after each match. Shaded band = 80% range.</Tip>
              </div>
              <div className="figure">
                <RatingChart points={hist.map((h) => ({ t: h.t, mean: h.mean, sd: h.sd, event: h.event_key }))} />
              </div>
            </section>
            <section className="section">
              <div className="section-head">
                <h2>Where points come from</h2>
              </div>
              <div className="table-wrap"><table className="agate">
                <thead>
                  <tr>
                    <th>Component</th>
                    <th className="n">Points</th>
                    <th className="n">±SD</th>
                    <th className="hide-m" style={{ minWidth: 110 }}>
                      vs. season best
                    </th>
                    <th className="n" title="Share of rated teams this team is ahead of">
                      Percentile
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {spec.components.map((c) => {
                    const v = c.attribution === 'opponent' ? r.fouls : r.components[c.id];
                    if (!v) return null;
                    const others = all.map((x) => (c.attribution === 'opponent' ? x.rating.fouls.mean : (x.rating.components[c.id]?.mean ?? 0)));
                    const max = Math.max(...others, 0.1);
                    const below = others.filter((o) => (c.attribution === 'opponent' ? o > v.mean : o < v.mean)).length;
                    return (
                      <tr key={c.id}>
                        <td>
                          {c.label}
                        </td>
                        <td className="n strong">{pts(v.mean, 1)}</td>
                        <td className="n muted">{pts(v.sd, 1)}</td>
                        <td className="bar-cell hide-m">
                          <RangeBar mean={v.mean} sd={v.sd} max={max} />
                        </td>
                        <td className="n">{Math.round((100 * below) / Math.max(others.length, 1))}</td>
                      </tr>
                    );
                  })}
                  {r.defense ? (
                    <tr>
                      <td>
                        Defense
                      </td>
                      <td className="n strong">{pts(r.defense.mean, 1)}</td>
                      <td className="n muted">{pts(r.defense.sd, 1)}</td>
                      <td className="hide-m" />
                      <td className="n">{Math.round((100 * all.filter((x) => (x.rating.defense?.mean ?? 0) < r.defense!.mean).length) / all.length)}</td>
                    </tr>
                  ) : null}
                  <tr>
                    <td className="strong">Total</td>
                    <td className="n strong">{pts(r.net, 1)}</td>
                    <td className="n muted">{pts(r.total.sd, 1)}</td>
                    <td className="hide-m" />
                    <td className="n">{Math.round(100 * (1 - (rated!.rank - 1) / rated!.total))}</td>
                  </tr>
                </tbody>
              </table></div>
            </section>
          </div>

          <div className="grid-2">
            <section className="section">
              <div className="section-head">
                <h2>On the field</h2>
                <Tip label="About this table">Recorded by FIRST for this robot, with a 95% range.</Tip>
              </div>
              {Object.keys(r.outcomes).length ? (
                <div className="table-wrap free"><table className="agate">
                  <thead>
                    <tr>
                      <th>Recorded by FIRST</th>
                      <th>Outcome</th>
                      <th className="n">Count</th>
                      <th className="n">Rate</th>
                      <th className="n">95% interval</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(r.outcomes).flatMap(([cid, cats]) => {
                      const n = Object.values(cats).reduce((a, b) => a + b, 0);
                      const label = spec.components.find((c) => c.id === cid)?.label ?? cid;
                      return Object.entries(cats)
                        .sort((a, b) => b[1] - a[1])
                        .map(([cat, k], i) => {
                          const [lo, hi] = wilson(k, n);
                          return (
                            <tr key={cid + cat}>
                              <td>{i === 0 ? label : ''}</td>
                              <td>{cat}</td>
                              <td className="n">
                                {k}/{n}
                              </td>
                              <td className="n">{pct(k / n)}</td>
                              <td className="n muted">
                                {pct(lo)}–{pct(hi)}
                              </td>
                            </tr>
                          );
                        });
                    })}
                  </tbody>
                </table></div>
              ) : (
                <div className="empty">
                  <strong>No per-robot data</strong>
                  {year} score sheets only record alliances.
                </div>
              )}
            </section>
            <section className="section">
              <div className="section-head">
                <h2>Among all {rated!.total} teams</h2>
              </div>
              <div className="figure">
                <Histogram values={all.map((x) => x.rating.net)} highlight={r.net} xLabel="Points added per match" />
              </div>
            </section>
          </div>
        </>
      )}

      {similar.length ? (
        <section className="section" aria-labelledby="similar-head">
          <div className="section-head">
            <h2 id="similar-head">Plays a lot like</h2>
            <Tip label="How similar teams are found">Closest statistical profiles based on normalized auto, teleop, endgame, and defense contributions.</Tip>
          </div>
          <div className="similar-teams-grid">
            {similar.map((st) => (
              <Link key={st.key} href={`/teams/${st.number}?year=${year}`} className="similar-team-card">
                <Avatar team={st.number} year={year} size={28} />
                <div className="st-info">
                  <span className="st-num">{st.number}</span>
                  <span className="st-name muted">{st.nickname ?? ''}</span>
                </div>
                <span className="st-xpts">{st.rating.net.toFixed(1)} pts</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="section">
        <div className="section-head">
          <h2>Events</h2>
        </div>
        {evs.length ? (
          <div className="table-wrap free"><table className="agate">
            <thead>
              <tr>
                <th>Event</th>
                <th className="hide-m">Dates</th>
                {PHASE_COLS.filter((p) => spec.components.some((c) => c.phase === p.id)).map((p) => (
                  <th key={p.id} className="n">
                    {p.label}
                  </th>
                ))}
                <th className="n">xPts there</th>
                <th className="n">±SD</th>
              </tr>
            </thead>
            <tbody>
              {evs.map((e) => {
                const playedHere = matches.some((m) => m.eventKey === e.key && m.redScore !== null);
                const er = playedHere ? e.rating : null;
                return (
                  <tr key={e.key}>
                    <td>
                      <Link href={`/events/${e.key}`}>{e.name}</Link>
                    </td>
                    <td className="hide-m muted">
                      {dateRange(e.start_date, e.end_date)}
                      {!playedHere ? ' · no matches played' : ''}
                    </td>
                    {PHASE_COLS.filter((p) => spec.components.some((c) => c.phase === p.id)).map((p) => (
                      <td key={p.id} className="n">
                        {er ? pts(spec.components.filter((c) => c.phase === p.id).reduce((a, c) => a + (er.components[c.id] ?? 0), 0), 1) : '—'}
                      </td>
                    ))}
                    <td className="n strong">{er ? pts(er.total - er.fouls, 1) : '—'}</td>
                    <td className="n muted">{er ? pts(er.sd, 1) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        ) : (
          <Empty>No events on the radar.</Empty>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Matches</h2>
          <Tip label="About forecasts">Forecasts were locked before each match started.</Tip>
        </div>
        {matches.length ? (
          <div className="table-wrap">
            <table className="agate">
              <thead>
                <tr>
                  <th>Match</th>
                  <th>With</th>
                  <th className="hide-m">Against</th>
                  <th className="n">Forecast</th>
                  <th className="n">Score</th>
                  <th>Win chance</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m, i) => {
                  const color = m.red.includes(key) ? 'red' : 'blue';
                  const opp = color === 'red' ? 'blue' : 'red';
                  const f = m.prediction?.forecast;
                  const pWin = f ? (color === 'red' ? f.redWinProb : 1 - f.redWinProb) : null;
                  const own = color === 'red' ? m.redScore : m.blueScore;
                  const their = color === 'red' ? m.blueScore : m.redScore;
                  const res = m.winner === null ? null : m.winner === 'tie' ? 'T' : m.winner === color ? 'W' : 'L';
                  const newEvent = i === 0 || matches[i - 1].eventKey !== m.eventKey;
                  return [
                    newEvent ? (
                      <tr className="group" key={`${m.eventKey}-h`}>
                        <td colSpan={7}>{evs.find((e) => e.key === m.eventKey)?.name ?? m.eventKey}</td>
                      </tr>
                    ) : null,
                    <tr key={m.key}>
                      <td>
                        <Link href={`/matches/${m.key}`}>{matchLabel(m)}</Link>
                      </td>
                      <td className={color === 'red' ? 'red-t' : 'blue-t'}>
                        {m[color]
                          .filter((t) => t !== key)
                          .map((t, j) => (
                            <span key={t}>
                              {j ? ', ' : ''}
                              <TeamLink team={t} year={year} name={false} />
                            </span>
                          ))}
                      </td>
                      <td className="hide-m">
                        {m[opp].map((t, j) => (
                          <span key={t}>
                            {j ? ', ' : ''}
                            <TeamLink team={t} year={year} name={false} />
                          </span>
                        ))}
                      </td>
                      <td className="n muted">{f ? `${pts(f[color].mean, 0)}–${pts(f[opp].mean, 0)}` : '—'}</td>
                      <td className="n strong">{own !== null ? `${own}–${their}` : 'upcoming'}</td>
                      <td className="prob">
                        {pWin !== null ? (
                          <>
                            <WinBar p={color === 'red' ? pWin : 1 - pWin} small /> <span className="muted">{pct(pWin)}</span>
                          </>
                        ) : null}
                      </td>
                      <td className={res === 'W' ? 'hit' : res === 'L' ? 'miss' : 'muted'}>{res ?? ''}</td>
                    </tr>,
                  ];
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No matches logged yet.</Empty>
        )}
      </section>
    </>
  );
}
