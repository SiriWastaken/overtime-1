import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Empty, RangeBar, TeamLink, WinBar } from '@/components/bits';
import { Histogram, RatingChart } from '@/components/charts';
import { phaseRating, PHASE_COLS } from '@/components/RatingsTable';
import { seasonSpec } from '@/engine/seasons';
import { wilson } from '@/engine/stats';
import { dateRange, location, matchLabel, pct, pts, range } from '@/lib/format';
import { modelRun, resolveYear, teamEvents, teamHistory, teamMatches, teamMeta, teamRating, teamRatings, teamYears } from '@/lib/queries';

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

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            {number} {meta?.nickname ?? ''}
          </h1>
          <div className="sub">
            {meta ? location(meta) : 'Team details not synced'}
            {meta?.rookie_year ? ` · Rookie year ${meta.rookie_year}` : ''}
            {years.length > 1 ? (
              <>
                {' · Seasons: '}
                {years.map((y, i) => (
                  <span key={y}>
                    {i ? ', ' : ''}
                    {y === year ? <strong>{y}</strong> : <Link href={`/teams/${number}?year=${y}`}>{y}</Link>}
                  </span>
                ))}
              </>
            ) : null}
          </div>
        </div>
        {r && rated ? (
          <div className="facts">
            <div className="fact">
              <b>{pts(r.net, 1)}</b>
              <small>xPts / match</small>
            </div>
            <div className="fact">
              <b>
                {rated.rank}
                <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>/{rated.total}</span>
              </b>
              <small>season rank</small>
            </div>
            <div className="fact">
              <b>{range(r.total.mean - 1.2816 * r.total.sd, r.total.mean + 1.2816 * r.total.sd)}</b>
              <small>80% range, scoring</small>
            </div>
          </div>
        ) : null}
      </div>

      {!r ? (
        <Empty>
          No {year} rating for team {number}. {run ? 'They have no official matches stored for this season.' : `The ${year} season has not been modelled yet.`}
        </Empty>
      ) : (
        <>
          <div className="grid-2">
            <section className="section">
              <div className="section-head">
                <h2>Rating through the season</h2>
                <span className="note">line = estimate, hatch = 80% range</span>
              </div>
              <div className="figure">
                <RatingChart points={hist.map((h) => ({ t: h.t, mean: h.mean, sd: h.sd, event: h.event_key }))} />
                <figcaption>
                  Scoring contribution after each match, as it stood when that result became public. Wide early bands narrow as matches accumulate; the estimate carries between events with
                  extra uncertainty for robot changes.
                </figcaption>
              </div>
            </section>
            <section className="section">
              <div className="section-head">
                <h2>Where it comes from</h2>
              </div>
              <table className="agate">
                <thead>
                  <tr>
                    <th>Component</th>
                    <th className="n">xPts</th>
                    <th className="n">±SD</th>
                    <th style={{ minWidth: 110 }}>vs. season best</th>
                    <th className="n">Pctile</th>
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
                          {c.attribution === 'robot' ? <span className="muted"> · observed per robot</span> : null}
                          {c.attribution === 'opponent' ? <span className="muted"> · given to opponents</span> : null}
                        </td>
                        <td className="n strong">{pts(v.mean, 1)}</td>
                        <td className="n muted">{pts(v.sd, 1)}</td>
                        <td className="bar-cell">
                          <RangeBar mean={v.mean} sd={v.sd} max={max} />
                        </td>
                        <td className="n">{Math.round((100 * below) / Math.max(others.length, 1))}</td>
                      </tr>
                    );
                  })}
                  {r.defense ? (
                    <tr>
                      <td>
                        Opponent suppression <span className="muted">· lowers opponents’ scoring</span>
                      </td>
                      <td className="n strong">{pts(r.defense.mean, 1)}</td>
                      <td className="n muted">{pts(r.defense.sd, 1)}</td>
                      <td />
                      <td className="n">{Math.round((100 * all.filter((x) => (x.rating.defense?.mean ?? 0) < r.defense!.mean).length) / all.length)}</td>
                    </tr>
                  ) : null}
                  <tr>
                    <td className="strong">Net (scoring + suppression − fouls)</td>
                    <td className="n strong">{pts(r.net, 1)}</td>
                    <td className="n muted">{pts(r.total.sd, 1)}</td>
                    <td />
                    <td className="n">{Math.round(100 * (1 - (rated!.rank - 1) / rated!.total))}</td>
                  </tr>
                </tbody>
              </table>
              <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Percentile among {rated!.total} rated teams. Fouls percentile counts teams conceding more.
              </p>
            </section>
          </div>

          <div className="grid-2">
            <section className="section">
              <div className="section-head">
                <h2>Reliability</h2>
              </div>
              <dl className="kv" style={{ marginBottom: 12 }}>
                <dt>Volatility</dt>
                <dd>
                  {r.volatility.toFixed(2)}{' '}
                  <span className="muted">
                    {r.volatility < 0.9 ? 'steadier than forecast' : r.volatility > 1.2 ? 'more erratic than forecast' : 'about as variable as forecast'} (1.00 = alliances varied exactly as
                    expected)
                  </span>
                </dd>
                <dt>Matches</dt>
                <dd>
                  {r.matches} at {r.events.length} event{r.events.length === 1 ? '' : 's'}
                </dd>
              </dl>
              {Object.keys(r.outcomes).length ? (
                <table className="agate">
                  <thead>
                    <tr>
                      <th>Observed per robot</th>
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
                </table>
              ) : (
                <p className="muted">This season’s breakdown has no per-robot fields.</p>
              )}
            </section>
            <section className="section">
              <div className="section-head">
                <h2>Among all {rated!.total} teams</h2>
              </div>
              <div className="figure">
                <Histogram values={all.map((x) => x.rating.net)} highlight={r.net} xLabel="xPts per match" />
                <figcaption>Season distribution of net expected points; this team is marked.</figcaption>
              </div>
            </section>
          </div>
        </>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Events</h2>
        </div>
        {evs.length ? (
          <table className="agate">
            <thead>
              <tr>
                <th>Event</th>
                <th className="hide-m">Dates</th>
                {PHASE_COLS.filter((p) => spec.components.some((c) => c.phase === p.id)).map((p) => (
                  <th key={p.id} className="n">
                    {p.label}
                  </th>
                ))}
                <th className="n">xPts at event</th>
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
          </table>
        ) : (
          <Empty>No {year} events stored for this team.</Empty>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Matches</h2>
          <span className="note">forecast = frozen before the match started</span>
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
          <Empty>No {year} matches stored.</Empty>
        )}
      </section>
    </>
  );
}
