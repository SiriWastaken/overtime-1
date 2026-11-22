'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getPicklist, replay, toast } from '@/lib/fx';
import { pct } from '@/lib/format';
import { Avatar } from './bits';
import { edgePts } from './edge';

interface Fit {
  team: string;
  number: number;
  nickname: string | null;
  fit: number | null;
  edge: number | null;
  matches: number;
}
interface Draft {
  seats: (string | null)[];
  taken: string[];
  declined: string[];
  against: string[];
}
type Status = 'loading' | 'ok' | 'error';

const SEATS = ['Captain', 'Pick 1', 'Pick 2'];
const CLOCK_S = 120;
const num = (k: string) => k.slice(3);
// one decimal under 10 points, so a strong alliance's small, close lifts still rank visibly
const fitPts = (f: number) => edgePts(f, Math.abs(f) < 0.1 ? 1 : 0);
const blank = (mine: string | null): Draft => ({ seats: [mine, null, null], taken: [], declined: [], against: [] });
const clock = (s: number) => `${Math.floor(Math.abs(s) / 60)}:${String(Math.floor(Math.abs(s) % 60)).padStart(2, '0')}`;

function load(key: string, mine: string | null): Draft {
  try {
    const d = JSON.parse(localStorage.getItem(key) ?? 'null') as Draft | null;
    if (d && Array.isArray(d.seats) && d.seats.length === 3) return { ...blank(mine), ...d };
  } catch {}
  return blank(mine);
}

/**
 * Alliance selection: your three seats, the best next pick by Fit (win-chance lift in your next open seat), and a
 * draft clock that tracks taken and declined teams. One draft per season and event, saved on this device.
 */
export function PickBoard({ year, event, mine, field }: { year: number; event: { key: string; name: string } | null; mine: string | null; field?: React.ReactNode }) {
  const router = useRouter();
  const store = `ot:draft:${year}:${event?.key ?? 'season'}`;
  const [d, setD] = useState<Draft>(() => blank(mine));
  const [ready, setReady] = useState(false);
  const [fits, setFits] = useState<Fit[] | null>(null);
  const [win, setWin] = useState<number | null>(null);
  const [names, setNames] = useState<Record<string, string | null>>({});
  const [vs, setVs] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState<'fit' | 'list'>('fit');
  const [list, setList] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [ends, setEnds] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [confirm, setConfirm] = useState(false);
  const [editVs, setEditVs] = useState(false);
  const seatsEl = useRef<HTMLOListElement>(null);

  // ------------------------------------------------------------ persistence
  useEffect(() => {
    setD(load(store, mine));
    setReady(true);
  }, [store, mine]);
  useEffect(() => {
    if (ready) localStorage.setItem(store, JSON.stringify(d));
  }, [d, ready, store]);
  useEffect(() => {
    const sync = () => setList(getPicklist(year));
    sync();
    window.addEventListener('ot:picklist', sync);
    return () => window.removeEventListener('ot:picklist', sync);
  }, [year]);

  // ------------------------------------------------------------ ranking
  const filled = d.seats.filter((s): s is string => !!s);
  const gone = [...d.taken, ...d.declined];
  const sig = `${filled.join(',')}|${gone.join(',')}`;
  useEffect(() => {
    if (!ready) return;
    const p = new URLSearchParams({ year: String(year) });
    if (filled.length) p.set('mine', filled.map(num).join(','));
    if (gone.length) p.set('taken', gone.map(num).join(','));
    if (event) p.set('event', event.key);
    const ctl = new AbortController();
    setStatus('loading');
    fetch(`/api/v1/fit?${p}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((r: { fits: Fit[]; winChance: number; names: Record<string, string | null> }) => {
        setFits(r.fits);
        setNames((n) => ({ ...n, ...r.names }));
        setWin(r.winChance);
        setStatus('ok');
      })
      .catch((e) => e?.name !== 'AbortError' && setStatus('error'));
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, ready, year, event?.key, retry]);

  // head-to-head only when both alliances are complete (partial alliances give misleading odds)
  const h2h = filled.length === 3 && d.against.length === 3;
  useEffect(() => {
    if (!h2h) return setVs(null);
    const ctl = new AbortController();
    const p = new URLSearchParams({ year: String(year), red: filled.map(num).join(','), blue: d.against.map(num).join(',') });
    if (event) p.set('event', event.key);
    fetch(`/api/v1/predict?${p}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((r: { forecast: { redWinProb: number } }) => setVs(r.forecast.redWinProb))
      .catch(() => setVs(null));
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h2h, sig, d.against.join(','), year, event?.key]);

  // ------------------------------------------------------------ draft clock
  useEffect(() => {
    if (ends === null) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [ends]);
  const left = ends === null ? null : Math.ceil((ends - now) / 1000);
  const startClock = () => {
    setNow(Date.now());
    setEnds(Date.now() + CLOCK_S * 1000);
    toast('Clock’s running.');
  };

  // ------------------------------------------------------------ actions
  const open = d.seats.indexOf(null);
  const pick = useCallback(
    (team: string) => {
      const i = d.seats.indexOf(null);
      if (i < 0) return toast('Alliance is full.');
      if (d.seats.includes(team)) return toast(`${num(team)} is already in.`);
      setD((x) => ({ ...x, seats: x.seats.map((s, j) => (j === i ? team : s)), taken: x.taken.filter((t) => t !== team) }));
      const full = d.seats.filter(Boolean).length === 2;
      toast(full ? `${num(team)} to ${SEATS[i]}. Alliance set.` : `${num(team)} to ${SEATS[i]}. Re-ranking.`);
      if (ends !== null) {
        if (full) setEnds(null);
        else (setNow(Date.now()), setEnds(Date.now() + CLOCK_S * 1000));
      }
      requestAnimationFrame(() => replay(seatsEl.current?.children[i] ?? null));
    },
    [d.seats, ends]
  );
  const take = (team: string) => {
    setD((x) => ({ ...x, taken: [...x.taken, team] }));
    toast(`${num(team)} taken. Re-ranking.`);
  };
  const free = (i: number, declined: boolean) => {
    const team = d.seats[i];
    if (!team) return;
    setD((x) => ({ ...x, seats: x.seats.map((s, j) => (j === i ? null : s)), declined: declined ? [...x.declined, team] : x.declined }));
    toast(declined ? `${num(team)} declined. Re-ranking.` : `${num(team)} out.`);
  };
  const undo = () => {
    const last = gone.at(-1);
    if (!last) return;
    setD((x) => (x.declined.at(-1) === last ? { ...x, declined: x.declined.slice(0, -1) } : { ...x, taken: x.taken.filter((t) => t !== last) }));
    toast(`${num(last)} is back.`);
  };
  const reset = () => {
    if (!confirm) {
      setConfirm(true);
      setTimeout(() => setConfirm(false), 3000);
      return;
    }
    setConfirm(false);
    setEnds(null);
    setD(blank(mine));
    toast('Fresh board.');
  };

  // a team card's "Pick" lands here; "p" picks the best fit
  const best = fits?.find((f) => f.fit !== null && !d.seats.includes(f.team)) ?? null;
  useEffect(() => {
    const onPick = (e: Event) => pick((e as CustomEvent<string>).detail);
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable], dialog');
      if (e.key === 'p' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey && best && open >= 0) pick(best.team);
    };
    window.addEventListener('ot:pick', onPick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('ot:pick', onPick);
      window.removeEventListener('keydown', onKey);
    };
  }, [pick, best, open]);

  // ------------------------------------------------------------ list
  const byTeam = new Map((fits ?? []).map((f) => [f.team, f]));
  const term = q.trim().toLowerCase();
  const match = (f: Fit) => !term || String(f.number).startsWith(term) || (f.nickname ?? '').toLowerCase().includes(term);
  const source: (Fit | { team: string; missing: true })[] =
    view === 'fit' ? (fits ?? []).filter((f) => f !== best || term) : list.map((t) => byTeam.get(t) ?? { team: t, missing: true as const });
  const rows = source.filter((f) => ('missing' in f ? !term || num(f.team).startsWith(term) : match(f)));
  const shown = all || term ? rows : rows.slice(0, 24);
  const takenSet = new Set(gone);

  const meter = h2h && vs !== null ? vs : win;
  const meterCtx = h2h ? `vs ${d.against.map(num).join(' · ')}` : d.against.length ? `vs a typical alliance · ${d.against.map(num).join(' · ')} once you’re full` : 'vs a typical alliance';

  return (
    <div className={`pick${field ? ' with-field' : ''}`}>
      <div className="pick-main">
        <header className="pick-head">
          <h1>Alliance selection</h1>
          <EventSwitch year={year} event={event} onChange={(k) => router.push(`/?year=${year}${k ? `&event=${k}` : ''}`)} />
          {ends === null && open >= 0 ? (
            <button type="button" className="ghost clock-start" onClick={startClock}>
              Start draft clock
            </button>
          ) : null}
        </header>

        {left !== null ? (
          <div className={`clock${left <= 0 ? ' over' : left <= 20 ? ' late' : ''}`} role="timer" aria-live="off">
            <span className="clock-n">{left > 0 ? clock(left) : `+${clock(left)}`}</span>
            <span className="clock-what">
              {left > 0 ? `${SEATS[open] ?? 'Done'} on the clock.` : 'Overtime.'}
              <small>{gone.length ? `${d.taken.length} taken · ${d.declined.length} declined` : 'Mark teams Taken as they go.'}</small>
            </span>
            <span className="clock-ctl">
              {gone.length ? (
                <button type="button" className="ghost small" onClick={undo}>
                  Undo {num(gone.at(-1)!)}
                </button>
              ) : null}
              <button type="button" className="ghost small" onClick={() => setEnds(null)}>
                Stop
              </button>
            </span>
          </div>
        ) : null}

        <section aria-labelledby="seats-h">
          <h2 id="seats-h" className="sr-only">
            Your alliance
          </h2>
          <ol className="seats" ref={seatsEl}>
            {d.seats.map((t, i) => (
              <li key={i} className={`seat${t ? ' filled' : ''}${i === open ? ' next' : ''}`}>
                <span className="seat-role">{SEATS[i]}</span>
                {t ? (
                  <>
                    <button type="button" className="seat-team" data-peek={t} data-year={year}>
                      <Avatar team={t} year={year} size={20} />
                      <b className="seat-n">{num(t)}</b>
                      <span className="seat-name">{names[t] ?? byTeam.get(t)?.nickname ?? ''}</span>
                    </button>
                    <span className="seat-act">
                      {/* one action per seat: on the clock a filled seat can only have declined (Undo brings them back) */}
                      {ends !== null && i > 0 ? (
                        <button type="button" className="ghost small" onClick={() => free(i, true)} aria-label={`${num(t)} declined`}>
                          Declined
                        </button>
                      ) : (
                        <button type="button" className="ghost small" onClick={() => free(i, false)} aria-label={`Remove ${num(t)} from ${SEATS[i]}`}>
                          Remove
                        </button>
                      )}
                    </span>
                  </>
                ) : (
                  <span className="seat-open">{i === open ? 'Next' : 'Open'}</span>
                )}
              </li>
            ))}
          </ol>
          <div className="meter" role="group" aria-label="Win chance">
            <span className="meter-label">Win chance</span>
            <b className="meter-n">{meter === null ? '—' : pct(meter)}</b>
            <span className="meter-track" aria-hidden>
              <i style={{ ['--p' as string]: (meter ?? 0).toFixed(3) }} />
            </span>
            <span className="meter-ctx">
              {meterCtx}
              {editVs ? null : (
                <button type="button" className="link" onClick={() => setEditVs(true)}>
                  {d.against.length ? 'Change' : 'Set opponent'}
                </button>
              )}
            </span>
            {editVs ? (
              <form
                className="vs-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = String(new FormData(e.currentTarget).get('vs') ?? '');
                  const teams = [...new Set(v.split(/[\s,]+/).filter((x) => /^\d{1,5}$/.test(x)))].slice(0, 3).map((x) => `frc${x}`);
                  setD((x) => ({ ...x, against: teams }));
                  setEditVs(false);
                }}
              >
                <label htmlFor="vs">Opponent alliance</label>
                <input id="vs" name="vs" type="text" inputMode="numeric" autoComplete="off" placeholder="e.g. 1323 4414 2056" defaultValue={d.against.map(num).join(' ')} autoFocus />
                <button type="submit">Set</button>
              </form>
            ) : null}
          </div>
        </section>

        <section className="best" aria-live="polite" aria-atomic="true">
          {open < 0 ? (
            <>
              <p className="best-line">Alliance set.</p>
              <p className="best-why">Good luck out there.</p>
              <button type="button" className="ghost" onClick={reset}>
                {confirm ? 'Clear everything? Tap again' : 'New draft'}
              </button>
            </>
          ) : status === 'error' && !fits ? (
            <>
              <p className="best-line">No ratings came back.</p>
              <p className="best-why">The server didn’t answer. Your board is saved.</p>
              <button type="button" onClick={() => setRetry((r) => r + 1)}>
                Try again
              </button>
            </>
          ) : open === 0 ? (
            <form
              className="captain"
              onSubmit={(e) => {
                e.preventDefault();
                const v = String(new FormData(e.currentTarget).get('cap') ?? '').trim();
                if (/^\d{1,5}$/.test(v)) pick(`frc${v}`);
              }}
            >
              <label className="best-line" htmlFor="cap">
                Who’s captain?
              </label>
              <p className="best-why">Your team number. Every pick is ranked around it.</p>
              <div className="captain-row">
                <input id="cap" name="cap" type="text" inputMode="numeric" pattern="\d{1,5}" maxLength={5} autoComplete="off" placeholder="e.g. 254" required />
                <button type="submit" className="best-go">
                  Set captain
                </button>
              </div>
            </form>
          ) : !fits ? (
            <p className="best-line muted">Warming up…</p>
          ) : best ? (
            <>
              <p className="best-line">
                Best fit: <b className="team-num">{best.number}</b>
                <span className="best-name">{best.nickname ?? ''}</span>
              </p>
              <p className="best-why">
                <b className="pos-t">{fitPts(best.fit!)}</b> win-chance points with your alliance
                {best.matches < 8 ? ' · early, few matches' : ''}
              </p>
              <button type="button" className="best-go" onClick={() => pick(best.team)} aria-keyshortcuts="p">
                Pick {best.number} for {SEATS[open]}
              </button>
            </>
          ) : (
            <>
              <p className="best-line">Board’s empty.</p>
              <p className="best-why">Every rated team here is taken.</p>
            </>
          )}
        </section>

        <section className="board" aria-labelledby="board-h">
          <div className="board-head">
            <h2 id="board-h">{view === 'fit' ? 'Next best' : 'Your list'}</h2>
            <div className="seg" role="group" aria-label="List">
              <button type="button" aria-pressed={view === 'fit'} onClick={() => setView('fit')}>
                By fit
              </button>
              <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
                Your list{list.length ? ` · ${list.length}` : ''}
              </button>
            </div>
          </div>
          <label className="sr-only" htmlFor="board-q">
            Filter by number or name
          </label>
          <input id="board-q" type="search" placeholder="Filter by number or name" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" spellCheck={false} />
          <div className="board-cols" aria-hidden>
            <span>Team</span>
            <span>Fit</span>
          </div>
          <ol className={`board-rows${status === 'loading' && fits ? ' busy' : ''}`}>
            {shown.map((f) => {
              const t = f.team;
              const out = takenSet.has(t) || d.seats.includes(t);
              const fit = 'missing' in f ? undefined : f;
              return (
                <li key={t} className={out ? 'out' : undefined} data-peek={t} data-year={year}>
                  <Avatar team={t} year={year} />
                  <span className="team-num">{num(t)}</span>
                  <span className="nm">{fit?.nickname ?? ''}</span>
                  <span className={`fit-n${fit?.fit != null && fit.fit < 0 ? ' neg-t' : ''}`}>
                    {out ? (d.seats.includes(t) ? 'In' : 'Gone') : fit?.fit != null ? fitPts(fit.fit) : fit ? 'No data' : event ? 'Not here' : '—'}
                  </span>
                  <span className="row-act">
                    {!out && fit?.fit != null && open >= 0 ? (
                      <button type="button" className="ghost small pick-btn" onClick={() => pick(t)}>
                        Pick<span className="sr-only"> {num(t)}</span>
                      </button>
                    ) : null}
                    {ends !== null && !out ? (
                      <button type="button" className="ghost small" onClick={() => take(t)}>
                        Taken<span className="sr-only"> {num(t)}</span>
                      </button>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>
          {fits && !rows.length ? (
            <p className="status-line">
              {view === 'list' && !list.length ? 'Nobody here yet. Open a team and tap Add to picklist.' : `Nobody matches “${q}”.`}
            </p>
          ) : null}
          {rows.length > shown.length ? (
            <button type="button" className="ghost more" onClick={() => setAll(true)}>
              Show all {rows.length}
            </button>
          ) : null}
          <p className="board-note">
            Fit: win-chance points your alliance gains with this team in the {SEATS[open] ?? 'next'} seat, against typical alliances.
            {event ? '' : ' Showing the season’s top 200. Choose your event for its roster.'}
          </p>
          {gone.length && ends === null ? (
            <p className="board-note">
              {d.taken.length} taken · {d.declined.length} declined.{' '}
              <button type="button" className="link" onClick={undo}>
                Undo {num(gone.at(-1)!)}
              </button>{' '}
              <button type="button" className="link" onClick={reset}>
                {confirm ? 'Clear everything? Tap again' : 'New draft'}
              </button>
            </p>
          ) : null}
        </section>
      </div>
      {field ? <aside className="pick-field" aria-label="The field">{field}</aside> : null}
    </div>
  );
}

/** "At: <event>" — the roster the board ranks. Search is the same endpoint as ⌘K. */
function EventSwitch({ year, event, onChange }: { year: number; event: { key: string; name: string } | null; onChange: (key: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<{ key: string; name: string; status: string }[]>([]);
  useEffect(() => {
    const t = q.trim();
    if (!t) return setHits([]);
    const ctl = new AbortController();
    const id = setTimeout(() => {
      fetch(`/api/v1/search?year=${year}&q=${encodeURIComponent(t)}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((r: { events: { key: string; name: string; status: string }[] }) => setHits(r.events))
        .catch(() => {});
    }, 120);
    return () => (clearTimeout(id), ctl.abort());
  }, [q, year]);
  if (!open)
    return (
      <button type="button" className="event-btn" onClick={() => setOpen(true)} aria-label={`At ${event?.name ?? `any ${year} event`}. Change event`}>
        <span className="muted">At</span> {event?.name ?? `Any ${year} event`}
      </button>
    );
  return (
    <div className="event-pick">
      <label className="sr-only" htmlFor="ev-q">
        Event name or city
      </label>
      <input id="ev-q" type="search" autoFocus placeholder="Event name or city" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)} autoComplete="off" />
      <ul>
        {hits.map((h) => (
          <li key={h.key}>
            <button type="button" onClick={() => (setOpen(false), onChange(h.key))}>
              {h.name}
              {h.status === 'live' ? <span className="live-t"> Live</span> : null}
            </button>
          </li>
        ))}
        {event ? (
          <li>
            <button type="button" className="muted" onClick={() => (setOpen(false), onChange(null))}>
              No event: the whole season
            </button>
          </li>
        ) : null}
        <li>
          <button type="button" className="muted" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </li>
      </ul>
    </div>
  );
}
