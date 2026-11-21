import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Empty, TeamLink, WinBar } from '@/components/bits';
import { LineScore } from '@/components/LineScore';
import { PHASE_COLS } from '@/components/RatingsTable';
import { seasonSpec } from '@/engine/seasons';
import { playoffAnalysis, rankingAnalysis, selectionAnalysis, type TbaAlliance } from '@/lib/analysis';
import { ago, dateRange, location, matchLabel, pct, pct1, pts, range } from '@/lib/format';
import { event, eventAccuracy, eventMatches, eventResource, eventTeamKeys, eventTeamRatings, teamMetaMap, type MatchWithPrediction } from '@/lib/queries';

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const e = event((await params).key);
  return { title: e?.name ?? 'Event' };
}

const TABS = [
  { id: 'matches', label: 'Matches' },
  { id: 'rankings', label: 'Rankings' },
  { id: 'teams', label: 'Teams' },
  { id: 'playoffs', label: 'Playoffs' },
  { id: 'selection', label: 'Alliance selection' },
] as const;

export default async function EventPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string>> }) {
  const { key } = await params;
  const sp = await searchParams;
  const ev = event(key);
  if (!ev) notFound();
  const tab = TABS.find((t) => t.id === sp.tab)?.id ?? 'matches';
  const acc = eventAccuracy(key);
  const rated = ![0, 1, 2, 3, 4, 5].includes(ev.event_type) ? false : true;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{ev.name}</h1>
          <div className="sub">
            {dateRange(ev.start_date, ev.end_date)} · {location(ev)} · {ev.event_type_string}
            {ev.district_name ? ` · ${ev.district_name}` : ''} · <span className={`status ${ev.status}`}>{ev.status}</span>
            {ev.synced_at ? <span className="muted"> · synced {ago(ev.synced_at)}</span> : null}
          </div>
        </div>
        <div className="facts">
          <div className="fact">
            <b>{ev.teams}</b>
            <small>teams</small>
          </div>
          <div className="fact">
            <b>
              {ev.played}/{ev.scheduled}
            </b>
            <small>matches played</small>
          </div>
          {acc.n ? (
            <div className="fact">
              <b>{pct(acc.accuracy)}</b>
              <small>favourite won ({acc.n})</small>
            </div>
          ) : null}
        </div>
      </div>
      {!rated ? (
        <div className="notice">Off-season events are not rated: they use modified rules, B-teams and demo team numbers. Data is shown as reported by TBA.</div>
      ) : null}
      <nav className="tabs" aria-label="Event sections">
        {TABS.map((t) => (
          <Link key={t.id} href={`/events/${key}?tab=${t.id}`} aria-current={tab === t.id ? 'page' : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === 'matches' ? <Matches year={ev.year} matches={eventMatches(key)} /> : null}
      {tab === 'rankings' ? <Rankings eventKey={key} year={ev.year} /> : null}
      {tab === 'teams' ? <Teams eventKey={key} year={ev.year} /> : null}
      {tab === 'playoffs' ? <Playoffs eventKey={key} year={ev.year} /> : null}
      {tab === 'selection' ? <Selection eventKey={key} year={ev.year} captain={Number(sp.captain) || 1} /> : null}
    </>
  );
}

function Matches({ year, matches }: { year: number; matches: MatchWithPrediction[] }) {
  if (!matches.length) return <Empty>No match schedule published yet.</Empty>;
  const quals = matches.filter((m) => m.compLevel === 'qm');
  const playoffs = matches.filter((m) => m.compLevel !== 'qm');
  const next = matches.filter((m) => m.redScore === null).slice(0, 3);
  return (
    <>
      {next.length ? (
        <section className="section">
          <div className="section-head">
            <h2>Up next</h2>
          </div>
          <div className="grid-3">
            {next.map((m) => (
              <LineScore key={m.key} m={m} year={year} />
            ))}
          </div>
        </section>
      ) : null}
      {[
        ['Playoffs', playoffs],
        ['Qualifications', quals],
      ].map(([label, list]) =>
        (list as MatchWithPrediction[]).length ? (
          <section className="section" key={label as string}>
            <div className="section-head">
              <h2>{label as string}</h2>
              <span className="note">forecasts frozen at match start; open a match for its breakdown</span>
            </div>
            <MatchTable year={year} matches={list as MatchWithPrediction[]} />
          </section>
        ) : null
      )}
    </>
  );
}

function MatchTable({ year, matches }: { year: number; matches: MatchWithPrediction[] }) {
  return (
    <div className="table-wrap">
      <table className="agate">
        <thead>
          <tr>
            <th>Match</th>
            <th>Red</th>
            <th>Blue</th>
            <th className="n">Forecast</th>
            <th className="n">Red</th>
            <th className="n">Blue</th>
            <th>Red win chance</th>
            <th className="hide-m">Call</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m) => {
            const f = m.prediction?.forecast;
            const fav = f ? (f.redWinProb >= 0.5 ? 'red' : 'blue') : null;
            const call = m.winner && m.winner !== 'tie' && f && f.eligible ? (fav === m.winner ? 'hit' : 'miss') : null;
            return (
              <tr key={m.key}>
                <td>
                  <Link href={`/matches/${m.key}`}>{matchLabel(m)}</Link>
                </td>
                {(['red', 'blue'] as const).map((c) => (
                  <td key={c} className={`${c === 'red' ? 'red-t' : 'blue-t'} ${m.winner === c ? 'won' : ''}`}>
                    {m[c].map((t, i) => (
                      <span key={t}>
                        {i ? ' ' : ''}
                        <TeamLink team={t} year={year} name={false} />
                      </span>
                    ))}
                  </td>
                ))}
                <td className="n muted">{f ? `${pts(f.red.mean, 0)}–${pts(f.blue.mean, 0)}` : '—'}</td>
                <td className={`n ${m.winner === 'red' ? 'won' : ''} red-t`}>{m.redScore ?? ''}</td>
                <td className={`n ${m.winner === 'blue' ? 'won' : ''} blue-t`}>{m.blueScore ?? ''}</td>
                <td className="prob">
                  {f ? (
                    <>
                      <WinBar p={f.redWinProb} small /> <span className="muted">{pct(f.redWinProb)}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className={`hide-m ${call ?? 'muted'}`}>{call === 'hit' ? 'Correct' : call === 'miss' ? 'Upset' : f && !f.eligible ? 'early season' : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Rankings({ eventKey, year }: { eventKey: string; year: number }) {
  const ra = rankingAnalysis(eventKey);
  const tba = eventResource<{ rankings: { team_key: string; rank: number; record: { wins: number; losses: number; ties: number } | null; matches_played: number; sort_orders: number[] | null }[]; sort_order_info: { name: string; precision: number }[] | null }>(eventKey, 'rankings')?.data;
  if (!ra && !tba?.rankings?.length) return <Empty>No rankings yet. Rankings appear once qualification matches have been played.</Empty>;
  const meta = teamMetaMap([...(ra?.rows.map((r) => r.team) ?? []), ...(tba?.rankings?.map((r) => r.team_key) ?? [])]);
  const official = new Map((tba?.rankings ?? []).map((r) => [r.team_key, r]));
  const rows = ra?.rows ?? [];
  return (
    <section className="section">
      <div className="section-head">
        <h2>{ra && ra.remaining > 0 ? 'Projected final rankings' : 'Rankings'}</h2>
        <span className="note">
          {ra && ra.remaining > 0 ? `${ra.remaining} qualification matches left; 5,000 simulations of their RP outcomes` : 'Qualifications complete; official order from TBA'}
        </span>
      </div>
      <div className="table-wrap">
        <table className="agate">
          <thead>
            <tr>
              <th className="n">Official</th>
              <th>Team</th>
              <th className="n">Record</th>
              <th className="n">RP now</th>
              {ra && ra.remaining > 0 ? (
                <>
                  <th className="n">Expected final RP</th>
                  <th className="n">Mean rank</th>
                  <th className="n">Top 8</th>
                  <th className="n">First</th>
                </>
              ) : null}
              {(tba?.sort_order_info ?? []).slice(0, 3).map((s) => (
                <th key={s.name} className="n hide-m">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(rows.length ? rows.map((r) => r.team) : [...official.keys()])
              .map((t) => ({ t, sim: rows.find((r) => r.team === t), off: official.get(t) }))
              .sort((a, b) => (ra && ra.remaining > 0 ? 0 : (a.off?.rank ?? 999) - (b.off?.rank ?? 999)))
              .map(({ t, sim, off }) => (
                <tr key={t}>
                  <td className="n">{off?.rank ?? '—'}</td>
                  <td>
                    <TeamLink team={t} meta={meta.get(t)} year={year} />
                  </td>
                  <td className="n muted">{off?.record ? `${off.record.wins}-${off.record.losses}-${off.record.ties}` : '—'}</td>
                  <td className="n">{sim ? sim.currentRp : '—'}</td>
                  {ra && ra.remaining > 0 && sim ? (
                    <>
                      <td className="n strong">{sim.expectedRp.toFixed(1)}</td>
                      <td className="n">{sim.meanRank.toFixed(1)}</td>
                      <td className="n">{pct(sim.top8)}</td>
                      <td className="n">{pct(sim.top1)}</td>
                    </>
                  ) : null}
                  {(tba?.sort_order_info ?? []).slice(0, 3).map((s, i) => (
                    <td key={s.name} className="n hide-m muted">
                      {off?.sort_orders?.[i]?.toFixed(s.precision) ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        RP now counts only matches stored with a score breakdown; TBA’s official ranking is authoritative. Simulation ties are broken at random, standing in for game-specific tiebreakers.
      </p>
    </section>
  );
}

function Teams({ eventKey, year }: { eventKey: string; year: number }) {
  const ratings = eventTeamRatings(eventKey);
  const keys = [...new Set([...eventTeamKeys(eventKey), ...ratings.keys()])];
  if (!keys.length) return <Empty>No team list published yet.</Empty>;
  const meta = teamMetaMap(keys);
  const spec = seasonSpec(year);
  const phases = PHASE_COLS.filter((p) => spec.components.some((c) => c.phase === p.id));
  const rows = keys.map((k) => ({ k, r: ratings.get(k) })).sort((a, b) => (b.r ? b.r.total - b.r.fouls : -1e9) - (a.r ? a.r.total - a.r.fouls : -1e9));
  return (
    <section className="section">
      <div className="section-head">
        <h2>Teams at this event</h2>
        <span className="note">estimates as of the latest result at this event (or entering it, if it has not started)</span>
      </div>
      <div className="table-wrap">
        <table className="agate">
          <thead>
            <tr>
              <th className="rank">#</th>
              <th>Team</th>
              <th className="n">xPts</th>
              {phases.map((p) => (
                <th key={p.id} className="n">
                  {p.label}
                </th>
              ))}
              <th className="n">Fouls</th>
              <th className="n">80% range</th>
              <th className="n">Season matches</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ k, r }, i) => (
              <tr key={k}>
                <td className="rank n">{r ? i + 1 : ''}</td>
                <td>
                  <TeamLink team={k} meta={meta.get(k)} year={year} />
                </td>
                <td className="n strong">{r ? pts(r.total - r.fouls, 1) : '—'}</td>
                {phases.map((p) => (
                  <td key={p.id} className="n">
                    {r ? pts(spec.components.filter((c) => c.phase === p.id).reduce((a, c) => a + (r.components[c.id] ?? 0), 0), 1) : '—'}
                  </td>
                ))}
                <td className="n muted">{r ? pts(r.fouls, 1) : '—'}</td>
                <td className="n muted">{r ? range(r.total - 1.2816 * r.sd, r.total + 1.2816 * r.sd) : '—'}</td>
                <td className="n muted">{r?.matches ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Playoffs({ eventKey, year }: { eventKey: string; year: number }) {
  const pa = playoffAnalysis(eventKey);
  const al = eventResource<TbaAlliance[]>(eventKey, 'alliances')?.data;
  if (!pa || pa.alliances.length === 0)
    return <Empty>{al === null || !al?.length ? 'Alliances have not been selected yet. Use the Alliance selection tab to compare picks.' : 'No model outputs for this event yet.'}</Empty>;
  const meta = teamMetaMap(pa.alliances.flatMap((a) => a.teams));
  const champ = pa.sim?.champion;
  const byRound = new Map<string, NonNullable<typeof pa.bracket>['nodes']>();
  for (const n of pa.bracket?.nodes ?? []) byRound.set(n.round, [...(byRound.get(n.round) ?? []), n]);
  const label = (src: { seed?: number; winnerOf?: string; loserOf?: string }) => ('seed' in src && src.seed ? `A${src.seed}` : 'winnerOf' in src && src.winnerOf ? `W ${src.winnerOf}` : `L ${src.loserOf}`);
  return (
    <>
      {pa.formatNote ? <div className="notice">{pa.formatNote}</div> : null}
      <section className="section">
        <div className="section-head">
          <h2>Alliances</h2>
          <span className="note">{pa.bracket ? `${pa.bracket.name} · 20,000 simulated brackets, completed series fixed to their real results` : ''}</span>
        </div>
        <div className="table-wrap">
          <table className="agate">
            <thead>
              <tr>
                <th className="n">Seed</th>
                <th>Robots (official)</th>
                <th className="n">Expected score</th>
                <th className="n">80% range</th>
                {pa.before ? (
                  <th className="n" title="Simulated before any playoff match, from estimates frozen at that point">
                    Before playoffs
                  </th>
                ) : null}
                {champ ? <th className="n">{pa.before ? 'Now' : 'Wins event'}</th> : null}
                {champ ? <th style={{ minWidth: 120 }}>Title odds</th> : null}
              </tr>
            </thead>
            <tbody>
              {pa.alliances.map((a) => (
                <tr key={a.seed}>
                  <td className="n strong">{a.seed}</td>
                  <td>
                    {a.teams.map((t, i) => (
                      <span key={t}>
                        {i ? ' · ' : ''}
                        <TeamLink team={t} meta={meta.get(t)} year={year} name={i === 0} />
                      </span>
                    ))}
                  </td>
                  <td className="n">{pts(a.expected, 0)}</td>
                  <td className="n muted">{range(a.expected - 1.2816 * a.sd, a.expected + 1.2816 * a.sd)}</td>
                  {pa.before ? <td className="n">{pct(pa.before[a.seed] ?? 0)}</td> : null}
                  {champ ? <td className="n strong">{pct(champ[a.seed] ?? 0)}</td> : null}
                  {champ ? (
                    <td className="bar-cell">
                      <div className="hbar">
                        <i style={{ width: `${(champ[a.seed] ?? 0) * 100}%`, background: 'var(--ink)' }} />
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Expected score uses each alliance’s three highest-rated robots. Alliance members are TBA’s official selections; probabilities are simulated.
        </p>
      </section>
      {pa.bracket && pa.sim ? (
        <section className="section">
          <div className="section-head">
            <h2>Bracket</h2>
            <span className="note">solid = played (official); percentages = simulated chance of winning that series</span>
          </div>
          <div className="bracket">
            {[...byRound].map(([round, nodes]) => (
              <div className="bracket-col" key={round}>
                <h3>{round}</h3>
                {nodes.map((n) => {
                  const st = pa.actual[n.id];
                  const win = pa.sim!.seriesWin[n.id] ?? {};
                  const cands = Object.entries(win).sort((a, b) => b[1] - a[1]);
                  const known = st && st.red && st.blue ? [st.red, st.blue] : null;
                  return (
                    <div className="series" key={n.id}>
                      <div className="tag">
                        <span>
                          {n.id === 'F' ? 'Finals' : n.id} · {n.bracket !== 'final' ? n.bracket : `best of ${n.bestOf}`}
                        </span>
                        <span>{known ? (st.winner ? 'final' : `${st.redWins}–${st.blueWins}`) : `${label(n.red)} v ${label(n.blue)}`}</span>
                      </div>
                      {(known ? known.map((s) => [String(s), win[s] ?? 0] as const) : cands.slice(0, 3)).map(([s, p]) => (
                        <div key={s} className={`row ${st?.winner === Number(s) ? 'winner' : ''}`}>
                          <span>A{s}</span>
                          <span className="muted">{pa.alliances[Number(s) - 1]?.teams[0]?.slice(3)}</span>
                          <span className="p">{st?.winner ? (st.winner === Number(s) ? 'won' : '') : pct(p)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function Selection({ eventKey, year, captain }: { eventKey: string; year: number; captain: number }) {
  const al = eventResource<TbaAlliance[]>(eventKey, 'alliances')?.data;
  const sel = selectionAnalysis(eventKey, captain);
  if ('error' in sel) return <Empty>{sel.error}</Empty>;
  const meta = teamMetaMap([...sel.captains, ...sel.options.map((o) => o.team)]);
  const greedy = [...sel.options].sort((a, b) => b.net - a.net)[0];
  return (
    <>
      {al?.length ? (
        <div className="notice info">
          Alliance selection at this event is complete; see Playoffs for the official alliances. The tool below replays the decision{' '}
          {sel.frozen ? 'using robot estimates frozen before the first playoff match, so no playoff result leaks in.' : 'using the latest estimates.'}
        </div>
      ) : null}
      <section className="section">
        <div className="section-head">
          <h2>Pick values for alliance {captain}</h2>
          <span className="note">captains from {sel.basis}</span>
        </div>
        <form className="inline" action={`/events/${eventKey}`}>
          <input type="hidden" name="tab" value="selection" />
          <label htmlFor="captain">Captain</label>
          <select id="captain" name="captain" defaultValue={captain}>
            {sel.captains.map((c, i) => (
              <option key={c} value={i + 1}>
                Alliance {i + 1}: {c.slice(3)} {meta.get(c)?.nickname ?? ''}
              </option>
            ))}
          </select>
          <button type="submit">Evaluate picks</button>
        </form>
        <div className="table-wrap">
          <table className="agate">
            <thead>
              <tr>
                <th className="n">#</th>
                <th>First pick</th>
                <th className="n" title="Simulated probability this alliance wins the event">
                  Wins event
                </th>
                <th className="n">xPts</th>
                <th className="n">Alliance score</th>
                <th className="n">80% range</th>
              </tr>
            </thead>
            <tbody>
              {sel.options.map((o, i) => (
                <tr key={o.team}>
                  <td className="n muted">{i + 1}</td>
                  <td>
                    <TeamLink team={o.team} meta={meta.get(o.team)} year={year} />
                    {o.team === greedy?.team ? <span className="muted"> · highest rated</span> : null}
                  </td>
                  <td className="n strong">{pct1(o.eventWin)}</td>
                  <td className="n">{pts(o.net, 1)}</td>
                  <td className="n">{pts(o.allianceMean, 0)}</td>
                  <td className="n muted">{range(o.allianceMean - 1.2816 * o.allianceSd, o.allianceMean + 1.2816 * o.allianceSd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="prose" style={{ fontSize: 13, marginTop: 12 }}>
          <p>
            Each candidate is valued by simulating the rest of the draft (serpentine order, {sel.perAlliance} robots per alliance; other captains take the highest-rated team available)
            and then 4,000 runs of the {sel.bracketName.toLowerCase()}. That is why the order can differ from raw xPts: a pick changes which robots your rivals get, and
            a higher-variance alliance can be worth more to an underdog. Not modelled: declined invitations, captains picked by other captains, and robot pairings that work better or
            worse than their individual numbers suggest.
          </p>
        </div>
      </section>
    </>
  );
}
