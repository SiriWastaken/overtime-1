'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { addToPicklist, toast } from '@/lib/fx';
import { Avatar } from './bits';
import { EdgeGauge, edgePts, hot } from './edge';
import { MyTeamButton } from './ui';

interface Peek {
  team: { nickname: string | null; city: string | null; state_prov: string | null; country: string | null } | null;
  rating: { rank: number; total: number; rating: { net: number; matches: number; events: string[] } } | null;
  edge: { edge: number; lo80: number; hi80: number; rank: number; matches: number } | null;
}

/**
 * Slide-over team summary. Any element with data-peek="frc254" (and data-year) opens it on tap; links inside
 * the row other than the team link keep working, and modified clicks still open the full page.
 */
export function TeamPeek() {
  const [target, setTarget] = useState<{ team: string; year: number } | null>(null);
  const [data, setData] = useState<Peek | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
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
      setTarget((e as CustomEvent).detail);
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
    const ctl = new AbortController();
    fetch(`/api/v1/teams/${target.team.slice(3)}?year=${target.year}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: Peek) => {
        setData(d);
        setState('ok');
      })
      .catch((err) => err?.name !== 'AbortError' && setState('error'));
    return () => ctl.abort();
  }, [target]);

  useEffect(() => {
    if (!target) return;
    panel.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key !== 'Tab' || !panel.current) return;
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
  }, [target, state]);

  const close = () => {
    setTarget(null);
    opener.current?.focus();
  };
  if (!target) return null;
  const num = target.team.slice(3);
  const r = data?.rating;
  const ed = data?.edge;
  const place = data?.team ? [data.team.city, data.team.state_prov, data.team.country === 'USA' ? null : data.team.country].filter(Boolean).join(', ') : '';

  return (
    <>
      <div className="scrim" onClick={close} aria-hidden />
      <div className="peek" role="dialog" aria-modal="true" aria-labelledby="peek-title" ref={panel}>
        <header>
          <div>
            <h2 id="peek-title">
              <Avatar team={num} year={target.year} size={32} />{' '}
              <span className={`team-num${hot(data?.edge?.rank)}`}>
                {num}
              </span>{' '}
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
        {state === 'loading' ? <p className="muted">Clock’s running…</p> : null}
        {state === 'error' ? <p className="muted">Timeout. Close and try again.</p> : null}
        {state === 'ok' && !r ? <p className="muted">No {target.year} matches. Still in the pits.</p> : null}
        {r ? (
          <div className="tiles">
            {ed ? (
              <div className="tile hero-tile" style={{ gridColumn: '1 / -1' }}>
                <small>EDGE · extra wins per 100 matches vs a median robot</small>
                <EdgeGauge edge={ed.edge} lo={ed.lo80} hi={ed.hi80} matches={ed.matches} size="lg" />
                <span className="range-line">
                  80%: {edgePts(ed.lo80)} to {edgePts(ed.hi80)}
                </span>
              </div>
            ) : null}
            <div className="tile">
              <b>
                #{(ed?.rank ?? r.rank).toLocaleString()}
              </b>
              <small>of {r.total.toLocaleString()}</small>
            </div>
            <div className="tile">
              <b>
                {r.rating.net.toFixed(1)}
              </b>
              <small>Points added per match</small>
            </div>
            <div className="tile">
              <b>
                {r.rating.matches}
              </b>
              <small>matches</small>
            </div>
            <div className="tile">
              <b>
                {r.rating.events.length}
              </b>
              <small>events</small>
            </div>
          </div>
        ) : null}
        <div className="actions">
          <Link className="button" href={`/teams/${num}?year=${target.year}`} onClick={() => setTarget(null)}>
            View team report
          </Link>
          {r ? <MyTeamButton team={target.team} /> : null}
          {r ? (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                const added = addToPicklist(target.year, target.team);
                toast(added ? `${num} added to picklist` : `${num} is already on your list`);
              }}
            >
              Add to picklist
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
