'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getPicklist, replay, setPicklist, toast } from '@/lib/fx';
import { Avatar } from './bits';
import { EdgeGauge } from './edge';
import { Tug, type Side as Proj } from './Tug';

export interface PadTeam {
  key: string;
  number: number;
  nickname: string | null;
  edge: number | null;
}
type Side = 'red' | 'blue';
type Slots = Record<Side, (string | null)[]>;
interface Projection {
  forecast: { red: Proj; blue: Proj; redWinProb: number };
}

const n = (k: string) => k.slice(3);
const PAIRS = [
  [0, 1],
  [0, 2],
  [1, 2],
] as const;
// slot centres inside a pad, in % (top, bottom-left, bottom-right)
const AT = [
  [50, 17],
  [24, 83],
  [76, 83],
] as const;

export function LaunchPad({ year, pool, initial }: { year: number; pool: PadTeam[]; initial: Slots }) {
  const [slots, setSlots] = useState<Slots>(initial);
  const [pick, setPick] = useState<string[]>([]);
  const [info, setInfo] = useState(() => new Map(pool.map((t) => [t.key, t])));
  const [armed, setArmed] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<PadTeam[]>([]);
  const [proj, setProj] = useState<Projection | null>(null);
  const [pstate, setPstate] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const board = useRef<HTMLDivElement>(null);
  const wasFull = useRef(false);

  useEffect(() => {
    const sync = () => setPick(getPicklist(year));
    sync();
    window.addEventListener('ot:picklist', sync);
    return () => window.removeEventListener('ot:picklist', sync);
  }, [year]);

  // names / EDGE for teams we haven't seen (picklist, URL)
  const known = useRef(info);
  known.current = info;
  useEffect(() => {
    const missing = [...pick, ...slots.red, ...slots.blue].filter((k): k is string => !!k && !known.current.has(k));
    for (const k of new Set(missing))
      fetch(`/api/v1/search?year=${year}&q=${n(k)}`)
        .then((r) => r.json())
        .then((d: { teams: PadTeam[] }) => {
          const t = d.teams.find((x) => x.key === k);
          setInfo((m) => new Map(m).set(k, t ?? { key: k, number: Number(n(k)), nickname: null, edge: null }));
        })
        .catch(() => {});
  }, [pick, slots, year]);

  useEffect(() => {
    const term = q.trim();
    if (!term) return setFound([]);
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/v1/search?year=${year}&q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((d: { teams: PadTeam[] }) => {
          setFound(d.teams);
          setInfo((m) => {
            const next = new Map(m);
            for (const t of d.teams) next.set(t.key, t);
            return next;
          });
        })
        .catch(() => {});
    }, 90);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, year]);

  // live projection
  useEffect(() => {
    const red = slots.red.filter(Boolean) as string[];
    const blue = slots.blue.filter(Boolean) as string[];
    const params = new URLSearchParams({ year: String(year) });
    if (red.length) params.set('red', red.map(n).join(','));
    if (blue.length) params.set('blue', blue.map(n).join(','));
    window.history.replaceState(null, '', `/pick?${params}`);
    if (!red.length || !blue.length) {
      setPstate('idle');
      setProj(null);
      return;
    }
    const ctl = new AbortController();
    setPstate('loading');
    fetch(`/api/v1/predict?${params}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: Projection) => {
        setProj(d);
        setPstate('ok');
        const full = red.length === 3 && blue.length === 3;
        if (full && !wasFull.current) toast('Both alliances full.');
        wasFull.current = full;
      })
      .catch((e) => e?.name !== 'AbortError' && setPstate('error'));
    return () => ctl.abort();
  }, [slots, year]);

  const place = useCallback(
    (team: string, from: string | null, to: string | null, before?: string | null) => {
      if (to === 'pick') {
        const list = getPicklist(year).filter((t) => t !== team);
        const i = before ? list.indexOf(before) : -1;
        list.splice(i < 0 ? list.length : i, 0, team);
        setPicklist(year, list);
        if (from?.includes('-')) setSlots((s) => clear(s, from));
      } else if (to?.includes('-')) {
        setSlots((s) => {
          const [side, idx] = to.split('-') as [Side, string];
          const next: Slots = { red: [...s.red], blue: [...s.blue] };
          const displaced = next[side][+idx];
          for (const sd of ['red', 'blue'] as Side[]) next[sd] = next[sd].map((t) => (t === team ? null : t));
          next[side][+idx] = team;
          if (displaced && displaced !== team && from?.includes('-')) {
            const [fs, fi] = from.split('-') as [Side, string];
            next[fs][+fi] = displaced;
          }
          return next;
        });
      } else if (from?.includes('-')) {
        setSlots((s) => clear(s, from));
        return;
      } else return;
      setArmed(null);
      requestAnimationFrame(() => {
        const el = board.current?.querySelector(to === 'pick' ? `[data-zone="pick"] [data-team="${team}"]` : `[data-zone="${to}"]`);
        replay(el ?? null);
      });
    },
    [year]
  );

  // ---------------------------------------------------------------- pointer drag (mouse + touch)
  const drag = useRef<{ team: string; from: string | null; x: number; y: number; ghost: HTMLElement | null; over: Element | null; onTap?: () => void } | null>(null);
  const zoneAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest('[data-zone]') ?? null;
  const dragProps = (team: string, from: string | null, onTap?: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('.x, .add')) return;
      drag.current = { team, from, x: e.clientX, y: e.clientY, ghost: null, over: null, onTap };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.ghost) {
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
        const g = document.createElement('div');
        g.className = 'chip drag-ghost';
        g.textContent = n(d.team);
        document.body.appendChild(g);
        d.ghost = g;
      }
      d.ghost.style.left = `${e.clientX}px`;
      d.ghost.style.top = `${e.clientY}px`;
      const z = zoneAt(e.clientX, e.clientY);
      if (z !== d.over) {
        d.over?.classList.remove('over');
        z?.classList.add('over');
        d.over = z;
      }
    },
    onPointerUp: (e: React.PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      if (!d.ghost) {
        if (d.onTap) d.onTap();
        else if (!d.from) setArmed((a) => (a === d.team ? null : d.team));
        return;
      }
      d.ghost.remove();
      d.over?.classList.remove('over');
      const zone = zoneAt(e.clientX, e.clientY) as HTMLElement | null;
      const before = zone?.dataset.zone === 'pick' ? ((document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-team]') as HTMLElement | null)?.dataset.team ?? null) : null;
      place(d.team, d.from, zone?.dataset.zone ?? null, before);
    },
    onPointerCancel: () => {
      drag.current?.ghost?.remove();
      drag.current?.over?.classList.remove('over');
      drag.current = null;
    },
  });

  // Suggestions: the highest-EDGE robots not on a pad, for the emptier side.
  const placed = new Set([...slots.red, ...slots.blue].filter(Boolean) as string[]);
  const count = (s: Side) => slots[s].filter(Boolean).length;
  const target: Side | null = count('red') < 3 && count('red') <= count('blue') ? 'red' : count('blue') < 3 ? 'blue' : count('red') < 3 ? 'red' : null;
  const next = [...new Set([...pool.map((t) => t.key), ...pick])]
    .filter((k) => !placed.has(k))
    .map((k) => info.get(k))
    .filter((t): t is PadTeam => !!t && t.edge !== null)
    .sort((a, b) => b.edge! - a.edge!)
    .slice(0, 6);
  const launch = (team: string) => {
    if (!target) return toast('Both pads are full');
    place(team, null, `${target}-${slots[target].indexOf(null)}`);
  };

  const chip = (team: string, from: string | null, idx?: number, onTap?: () => void) => {
    const t = info.get(team);
    return (
      <button
        key={team}
        type="button"
        className="chip"
        data-team={team}
        aria-pressed={onTap ? undefined : armed === team}
        aria-describedby="pad-how"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (onTap) onTap();
            else setArmed((a) => (a === team ? null : team));
          }
          if (e.key === 'Escape') setArmed(null);
        }}
        {...dragProps(team, from, onTap)}
      >
        {idx !== undefined ? <span className="pick-n">{idx + 1}</span> : null}
        <Avatar team={team} year={year} />
        <span className="team-num">{n(team)}</span>
        {t?.nickname ? <span className="sr-only"> {t.nickname}</span> : null}
        <EdgeGauge edge={t?.edge} size="xs" />
      </button>
    );
  };

  const slot = (side: Side, i: number) => {
    const team = slots[side][i];
    const id = `${side}-${i}`;
    const t = team ? info.get(team) : null;
    const drop = () => armed && place(armed, null, id);
    return (
      <div
        key={id}
        role="button"
        tabIndex={0}
        className={`slot${team ? ' filled' : ''}${armed && !team ? ' armed' : ''}`}
        style={{ left: `${AT[i][0]}%`, top: `${AT[i][1]}%` }}
        data-zone={id}
        aria-describedby="pad-how"
        onClick={drop}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && armed && (e.preventDefault(), drop())}
        {...(team ? dragProps(team, id) : {})}
      >
        <span className="sr-only">{`${side} slot ${i + 1}: `}</span>
        {team ? (
          <>
            <Avatar team={team} year={year} />
            <span className="team-num">{n(team)}</span>
            <span className="name">{t?.nickname ?? ''}</span>
            <EdgeGauge edge={t?.edge} size="xs" />
            <span
              className="x"
              role="button"
              tabIndex={0}
              aria-label={`Remove ${n(team)}`}
              onClick={(e) => {
                e.stopPropagation();
                setSlots((s) => clear(s, id));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  setSlots((s) => clear(s, id));
                }
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </span>
          </>
        ) : (
          <span className="open">{armed ? `Drop ${n(armed)}` : 'Open'}</span>
        )}
      </div>
    );
  };

  const p = proj?.forecast;
  const any = count('red') + count('blue') > 0;

  return (
    <div className="launch" ref={board}>
      <div className="pads">
        {(['red', 'blue'] as Side[]).map((side) => (
          <section key={side} className={`pad-side ${side}${count(side) === 3 ? ' full' : ''}${target === side ? ' next' : ''}`} aria-label={`${side} alliance`}>
            <h2>
              <span className={side === 'red' ? 'red-t' : 'blue-t'}>{side === 'red' ? 'Red' : 'Blue'}</span>
              <span className="muted">{count(side)}/3</span>
            </h2>
            <div className="formation">
              <svg className="constellation" aria-hidden>
                {PAIRS.map(([a, b]) =>
                  slots[side][a] && slots[side][b] ? (
                    <line key={`${a}${b}${slots[side][a]}${slots[side][b]}`} x1={`${AT[a][0]}%`} y1={`${AT[a][1]}%`} x2={`${AT[b][0]}%`} y2={`${AT[b][1]}%`} pathLength={1} />
                  ) : null
                )}
              </svg>
              {[0, 1, 2].map((i) => slot(side, i))}
            </div>
          </section>
        ))}
      </div>

      <div className="pad-mid">
        <Tug redP={p ? p.redWinProb : null} red={p?.red} blue={p?.blue} busy={pstate === 'loading'} idle={pstate === 'error' ? 'Timeout. Try again.' : 'Load both pads'} />
        <div className="pad-actions">
          <button type="button" className="ghost" onClick={() => setSlots((s) => ({ red: s.blue, blue: s.red }))} disabled={!any}>
            Swap
          </button>
          <button type="button" className="ghost" onClick={() => setSlots({ red: [null, null, null], blue: [null, null, null] })} disabled={!any}>
            Clear pads
          </button>
        </div>
      </div>

      <div className="pad-lower">
        {next.length && target ? (
          <section className="suggest" aria-labelledby="suggest-h">
            <h2 id="suggest-h">
              Suggested for <span className={target === 'red' ? 'red-t' : 'blue-t'}>{target === 'red' ? 'Red' : 'Blue'}</span>
            </h2>
            <ol className="rows">
              {next.map((t, i) => (
                <li key={t.key} data-team={t.key} {...dragProps(t.key, null, () => {})}>
                  <Avatar team={t.number} year={year} />
                  <span className="team-num">{t.number}</span>
                  <span className="nm">{t.nickname ?? ''}</span>
                  <EdgeGauge edge={t.edge} />
                  {/* one primary action: the best suggestion; the rest are secondary */}
                  <button type="button" className={i === 0 ? 'add' : 'add ghost'} onClick={() => launch(t.key)}>
                    Add<span className="sr-only"> {t.number}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <aside className="tray" aria-label="Robots">
          <div className="section-head">
            <h2>Picklist</h2>
            {pick.length ? (
              <button type="button" className="ghost small" onClick={() => (setPicklist(year, []), toast('Picklist cleared'))}>
                Clear
              </button>
            ) : null}
          </div>
          <div className="zone" data-zone="pick" aria-label="Picklist. Drag robots here.">
            {pick.length ? pick.map((t, i) => chip(t, 'pick', i)) : <span className="empty-line">Drag robots here</span>}
          </div>
          <label className="sr-only" htmlFor="pad-q">
            Find a robot
          </label>
          <input id="pad-q" type="search" placeholder="Find a robot" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          {q.trim() ? (
            <div className="pool">
              {found.map((t) => chip(t.key, null))}
              {!found.length ? <span className="hint">Sudden death: no match.</span> : null}
            </div>
          ) : null}
          <span className="hint">{armed ? `${n(armed)} picked up. Tap a slot.` : 'Tap to pick up, tap a slot to drop. Or drag.'}</span>
          <span id="pad-how" className="sr-only">
            Press Enter on a robot to pick it up, then Enter on a slot to place it.
          </span>
        </aside>
      </div>
    </div>
  );
}

function clear(s: Slots, id: string): Slots {
  const [side, i] = id.split('-') as [Side, string];
  const next: Slots = { red: [...s.red], blue: [...s.blue] };
  next[side][+i] = null;
  return next;
}
