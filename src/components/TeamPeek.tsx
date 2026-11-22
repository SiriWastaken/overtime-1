'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { addToPicklist, toast } from '@/lib/fx';
import { dateRange, matchLabel, pct } from '@/lib/format';
import { Avatar, Spark } from './bits';
import { EdgeGauge, edgePts, hot } from './edge';
import { MyTeamButton } from './ui';

type Est = { mean: number; sd: number };
interface Peek {
  team: { nickname: string | null; city: string | null; state_prov: string | null; country: string | null } | null;
  rating: { rank: number; total: number; rating: { net: number; matches: number; events: string[]; components: Record<string, Est>; defense?: Est; fouls: Est } } | null;
  edge: { edge: number; lo80: number; hi80: number; rank: number; matches: number } | null;
  events: { key: string; name: string; short_name: string | null; start_date: string; end_date: string }[];
  history: { mean: number }[];
}
interface BriefMatch {
  key: string;
  eventKey: string;
  compLevel: string;
  setNumber: number;
  matchNumber: number;
  red: string[];
  blue: string[];
  redScore: number | null;
  blueScore: number | null;
  winner: string | null;
  time: number | null;
  redWinProb: number | null;
}
interface Target {
  team: string;
  year: number;
  /** see-through, non-modal: the page behind stays visible and clickable (the team map) */
  see?: boolean;
}

/** Each match from this team's side: result, score, and the model's pre-match win chance. */
function fromSide(m: BriefMatch, team: string) {
  const red = m.red.includes(team);
  const us = red ? m.redScore : m.blueScore;
  const them = red ? m.blueScore : m.redScore;
  const res: 'W' | 'L' | 'T' | null = !m.winner ? null : m.winner !== 'red' && m.winner !== 'blue' ? 'T' : (m.winner === 'red') === red ? 'W' : 'L';
  const p = m.redWinProb === null ? null : red ? m.redWinProb : 1 - m.redWinProb;
  return { red, us, them, res, p };
}

const fix1 = (v: number) => (Math.abs(v) < 0.05 ? 0 : v).toFixed(1); // no "−0.0"

// Phase totals from the rating's components ("auto_fuel", "teleop_fuel", …); "#def" parts are defense, shown separately.
function phases(c: Record<string, Est>) {
  const sum = (p: string) => Object.entries(c).reduce((s, [k, v]) => (k.startsWith(p) && !k.includes('#') ? s + v.mean : s), 0);
  return [
    ['Auto', sum('auto')],
    ['Teleop', sum('teleop')],
    ['Endgame', sum('endgame')],
  ] as const;
}

/**
 * Slide-over team summary. Any element with data-peek="frc254" (and data-year) opens it on tap; links inside
 * the row other than the team link keep working, and modified clicks still open the full page.
 */
export function TeamPeek() {
  const [target, setTarget] = useState<Target | null>(null);
  const [data, setData] = useState<Peek | null>(null);
  const [matches, setMatches] = useState<BriefMatch[] | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error' | 'missing'>('loading');
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const el = e.target as HTMLElement;
      const row = el.closest<HTMLElement>('[data-peek]');
      if (!row) return;
      const link = el.closest('a');
      if (link && !link.classList.contains('team')) return;
      if (el.closest('button, input, select')) return;
      e.preventDefault();
      opener.current = (link as HTMLElement) ?? row;
      setTarget({ team: row.dataset.peek!, year: Number(row.dataset.year) });
    };
    const onPeek = (e: Event) => {
      opener.current = document.activeElement as HTMLElement | null;
      setTarget((e as CustomEvent<Target>).detail);
    };
    document.addEventListener('click', onClick);
    window.addEventListener('ot:peek', onPeek);
    return () => {
      document.removeEventListener('click', onClick);
      window.removeEventListener('ot:peek', onPeek);
    };
  }, []);

  useEffect(() => {
    if (!target) return;
    setState('loading');
    setData(null);
    setMatches(null);
    const ctl = new AbortController();
    const n = target.team.slice(3);
    fetch(`/api/v1/teams/${n}?year=${target.year}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: Peek) => {
        setData(d);
        setState('ok');
      })
      .catch((err) => err?.name !== 'AbortError' && setState(err === 404 ? 'missing' : 'error'));
    // extra detail; the card works without it
    fetch(`/api/v1/teams/${n}/matches?year=${target.year}&brief=1`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((m: BriefMatch[]) => setMatches(m))
      .catch(() => {});
    return () => ctl.abort();
  }, [target]);

  const see = !!target?.see;
  useEffect(() => {
    if (!target) return;
    if (!see) panel.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      // see-through card is non-modal: no focus trap
      if (see || e.key !== 'Tab' || !panel.current) return;
      const f = [...panel.current.querySelectorAll<HTMLElement>('a, button')];
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault();
        f.at(-1)!.focus();
      } else if (!e.shiftKey && document.activeElement === f.at(-1)) {
        e.preventDefault();
        f[0].focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, state, see]);

  const close = () => {
    setTarget(null);
    opener.current?.focus();
  };
  if (!target) return null;
  const num = target.team.slice(3);
  // on Pick (home) the card's one job is to pick; everywhere else it builds your list
  const onPick = typeof window !== 'undefined' && window.location.pathname === '/';
  const r = data?.rating;
  const ed = data?.edge;
  const place = data?.team ? [data.team.city, data.team.state_prov, data.team.country === 'USA' ? null : data.team.country].filter(Boolean).join(', ') : '';

  const played = (matches ?? []).filter((m) => m.winner !== null && m.redScore !== null && m.redScore >= 0).sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
  const tally = (ms: BriefMatch[]) => {
    const t = { W: 0, L: 0, T: 0 };
    for (const m of ms) {
      const res = fromSide(m, target.team).res;
      if (res) t[res]++;
    }
    return `${t.W}–${t.L}${t.T ? `–${t.T}` : ''}`;
  };
  const evName = new Map((data?.events ?? []).map((e) => [e.key, e.short_name || e.name]));
  const lastEvent = played.length ? data?.events.find((e) => e.key === played[0].eventKey) : undefined;
  const recent = (data?.history ?? []).slice(-12).map((h) => h.mean);

  return (
    <>
      {see ? null : <div className="scrim" onClick={close} aria-hidden />}
      <div className={`peek${see ? ' see' : ''}`} role="dialog" aria-modal={!see} aria-labelledby="peek-title" ref={panel}>
        <header>
          <div>
            <h2 id="peek-title">
              <Avatar team={num} year={target.year} size={32} /> <span className={`team-num${hot(data?.edge?.rank)}`}>{num}</span>{' '}
              <span className="muted">{data?.team?.nickname ?? ''}</span>
            </h2>
            {place ? <p>{place}</p> : null}
          </div>
          <button type="button" className="ghost icon" onClick={close} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        {state === 'loading' ? <p className="muted">Warming up…</p> : null}
        {state === 'error' ? <p className="muted">Couldn’t load {num}. Check your connection and open it again.</p> : null}
        {state === 'missing' ? <p className="muted">No team {num} in {target.year}.</p> : null}
        {state === 'ok' && !r ? <p className="muted">No {target.year} matches. Still in the pits.</p> : null}
        {r ? (
          <>
            <div className="tiles">
              {ed ? (
                <div className="tile hero-tile" style={{ gridColumn: '1 / -1' }}>
                  <small>EDGE · win-chance points vs a median robot</small>
                  <EdgeGauge edge={ed.edge} lo={ed.lo80} hi={ed.hi80} matches={ed.matches} size="lg" />
                  <span className="range-line">
                    80%: {edgePts(ed.lo80)} to {edgePts(ed.hi80)}
                  </span>
                </div>
              ) : null}
              <div className="tile">
                <b>#{(ed?.rank ?? r.rank).toLocaleString()}</b>
                <small>Rank of {r.total.toLocaleString()}</small>
              </div>
              <div className="tile">
                <b>{r.rating.net.toFixed(1)}</b>
                <small>Points added / match</small>
              </div>
              <div className="tile">
                <b>{played.length ? tally(played) : '—'}</b>
                <small>Record (W–L)</small>
              </div>
              <div className="tile">
                <b>{r.rating.matches}</b>
                <small>
                  Matches · {r.rating.events.length} event{r.rating.events.length === 1 ? '' : 's'}
                </small>
              </div>
            </div>

            <section className="peek-sec" aria-labelledby="pk-pts">
              <h3 id="pk-pts">Where points come from</h3>
              <dl className="pk-kv">
                {phases(r.rating.components).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{fix1(v)}</dd>
                  </div>
                ))}
                {r.rating.defense ? (
                  <div>
                    <dt>Defense</dt>
                    <dd>{fix1(r.rating.defense.mean)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Fouls given away</dt>
                  <dd>{fix1(r.rating.fouls.mean)}</dd>
                </div>
              </dl>
            </section>

            {recent.length > 1 ? (
              <section className="peek-sec" aria-labelledby="pk-form">
                <h3 id="pk-form">Recent scoring</h3>
                <div className="pk-form">
                  <Spark values={recent} />
                  <span>
                    {recent[0].toFixed(0)} → <b>{recent.at(-1)!.toFixed(0)}</b> over the last {recent.length} matches
                  </span>
                </div>
              </section>
            ) : null}

            {lastEvent ? (
              <section className="peek-sec" aria-labelledby="pk-ev">
                <h3 id="pk-ev">Latest event</h3>
                <p className="pk-ev">
                  <Link href={`/events/${lastEvent.key}`}>{lastEvent.name}</Link>
                  <span>
                    {dateRange(lastEvent.start_date, lastEvent.end_date)} · went {tally(played.filter((m) => m.eventKey === lastEvent.key))}
                  </span>
                </p>
              </section>
            ) : null}

            {played.length ? (
              <section className="peek-sec" aria-labelledby="pk-m">
                <h3 id="pk-m">Last {Math.min(5, played.length)} matches</h3>
                <table className="pk-matches">
                  <thead>
                    <tr>
                      <th scope="col">Match</th>
                      <th scope="col" className="n">
                        Score
                      </th>
                      <th scope="col" className="n">
                        Win chance
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {played.slice(0, 5).map((m) => {
                      const s = fromSide(m, target.team);
                      return (
                        <tr key={m.key}>
                          <td>
                            <Link href={`/matches/${m.key}`}>{matchLabel(m)}</Link>
                            <span className="muted"> · {evName.get(m.eventKey) ?? m.eventKey}</span>
                          </td>
                          <td className="n">
                            <span className={s.red ? 'red-t' : 'blue-t'}>{s.red ? 'R' : 'B'}</span> {s.us}–{s.them}{' '}
                            <b className={s.res === 'W' ? 'hit' : 'miss'}>{s.res}</b>
                          </td>
                          <td className="n">{s.p === null ? '—' : pct(s.p)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            ) : null}
          </>
        ) : null}
        <div className="actions">
          {r && onPick ? (
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('ot:pick', { detail: target.team }));
                setTarget(null);
              }}
            >
              Pick {num}
            </button>
          ) : null}
          {r ? (
            <button
              type="button"
              className={onPick ? 'ghost' : undefined}
              onClick={() => {
                const added = addToPicklist(target.year, target.team);
                toast(added ? `${num} on your list.` : `${num} is already on your list.`);
              }}
            >
              Add to picklist
            </button>
          ) : null}
          <span className="actions-more">
            <Link href={`/teams/${num}?year=${target.year}`} onClick={() => setTarget(null)}>
              Full report
            </Link>
            {r ? <MyTeamButton team={target.team} /> : null}
          </span>
        </div>
      </div>
    </>
  );
}
