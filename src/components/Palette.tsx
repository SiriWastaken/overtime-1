'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { getMyTeam, setCalm } from '@/lib/fx';
import { Avatar } from './bits';
import { EdgeGauge } from './edge';
import { useCalm } from './ui';

interface TeamHit {
  key: string;
  number: number;
  nickname: string | null;
  rank: number;
  edge: number | null;
}
interface EventHit {
  key: string;
  name: string;
  status: string;
}
interface Item {
  id: string;
  label: string;
  hint?: string;
  group: string;
  team?: TeamHit;
  run: () => void;
}

export const SEASONAL = ['/', '/teams', '/events', '/analytics', '/pick', '/predict', '/directory'];

/** ⌘K / Ctrl+K (or "/") from anywhere: teams, events, places, season, calm mode. On Explore, a team flies the camera. */
export function Palette({ years, fallback }: { years: number[]; fallback: number | null }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const year = Number(params.get('year')) || fallback;
  const calm = useCalm();
  const dlg = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'all' | 'season'>('all');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<{ teams: TeamHit[]; events: EventHit[] }>({ teams: [], events: [] });
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [active, setActive] = useState(0);

  useEffect(() => {
    const show = (m: 'all' | 'season' = 'all') => {
      setMode(m);
      setQ('');
      setActive(0);
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]');
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault();
        show();
      }
    };
    const onOpen = (e: Event) => show((e as CustomEvent).detail === 'season' ? 'season' : 'all');
    window.addEventListener('keydown', onKey);
    window.addEventListener('ot:palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('ot:palette', onOpen);
    };
  }, []);

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      input.current?.focus();
    } else if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (!term || mode === 'season') {
      setHits({ teams: [], events: [] });
      setState('idle');
      return;
    }
    const ctl = new AbortController();
    setState('loading');
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/v1/search?q=${encodeURIComponent(term)}${year ? `&year=${year}` : ''}`, { signal: ctl.signal });
        if (!r.ok) throw new Error(String(r.status));
        setHits(await r.json());
        setActive(0);
        setState('done');
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setState('error');
      }
    }, 80);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, year, mode]);

  const items = useMemo<Item[]>(() => {
    const y = year ? `?year=${year}` : '';
    const go = (href: string) => () => router.push(href);
    const seasons: Item[] = years.map((yy) => ({
      id: `season-${yy}`,
      group: 'Season',
      label: `Season ${yy}`,
      hint: yy === year ? 'Now' : undefined,
      run: () => {
        const next = new URLSearchParams(params);
        next.set('year', String(yy));
        const scoped = SEASONAL.includes(path) || path.startsWith('/teams/');
        router.push(`${scoped ? path : '/'}?${next}`);
      },
    }));
    if (mode === 'season') return seasons;
    const mine = typeof document !== 'undefined' ? getMyTeam() : null;
    const places: Item[] = [
      { id: 'explore', group: 'Go', label: 'Explore', hint: 'Galaxy', run: go(`/${y}`) },
      { id: 'teams', group: 'Go', label: 'Teams', hint: 'Every team', run: go(`/teams${y}`) },
      { id: 'pick', group: 'Go', label: 'Pick', hint: 'Launch pad', run: go(`/pick${y}`) },
      { id: 'predict', group: 'Go', label: 'Predict', hint: 'Sudden death', run: go(`/predict${y}`) },
      ...(mine ? [{ id: 'mine', group: 'Go', label: `My team · ${mine.slice(3)}`, run: go(`/teams/${mine.slice(3)}${y}`) }] : []),
      { id: 'events', group: 'Go', label: 'Events', hint: 'Directory', run: go(`/events${y}`) },
      { id: 'directory', group: 'Go', label: 'Directory', run: go(`/directory${y}`) },
      { id: 'accuracy', group: 'Go', label: 'Model accuracy', run: go(`/analytics${y}`) },
      { id: 'how', group: 'Go', label: 'How it works', run: go('/methodology') },
      { id: 'api', group: 'Go', label: 'Data & API', run: go('/developers') },
      { id: 'calm', group: 'Settings', label: calm ? 'Calm mode: on' : 'Calm mode: off', hint: 'Toggle', run: () => setCalm(!calm) },
    ];
    const term = q.trim().toLowerCase();
    if (!term) return [...places, ...seasons];
    const fly = path === '/';
    const teams: Item[] = hits.teams.map((t) => ({
      id: t.key,
      group: 'Teams',
      label: `${t.number}`,
      hint: t.nickname ?? '',
      team: t,
      run: fly ? () => window.dispatchEvent(new CustomEvent('ot:fly', { detail: t.number })) : go(`/teams/${t.number}${y}`),
    }));
    const events: Item[] = hits.events.map((e) => ({ id: e.key, group: 'Events', label: e.name, hint: e.status === 'live' ? 'Live' : undefined, run: go(`/events/${e.key}`) }));
    const match = (i: Item) => i.label.toLowerCase().includes(term);
    return [...teams, ...events, ...places.filter(match), ...seasons.filter(match)];
  }, [q, hits, mode, years, year, path, params, router, calm]);

  const choose = (i: Item | undefined) => {
    if (!i) return;
    setOpen(false);
    i.run();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(items[active]);
    }
  };
  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listId]);

  return (
    <dialog ref={dlg} className="palette" aria-label="Command palette" onClose={() => setOpen(false)} onClick={(e) => e.target === dlg.current && setOpen(false)}>
      {open ? (
        <div className="palette-box">
          <div className="palette-in">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
              <circle cx="10.5" cy="10.5" r="6" />
              <path d="m15 15 5 5" />
            </svg>
            <input
              ref={input}
              type="search"
              role="combobox"
              aria-label={mode === 'season' ? 'Pick a season' : 'Team, event or place'}
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
              placeholder={mode === 'season' ? 'Season' : path === '/' ? 'Fly to a team' : 'Team, event or place'}
              value={q}
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="go"
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
            />
            <kbd aria-hidden>esc</kbd>
          </div>
          <ul className="palette-list" id={listId} role="listbox" aria-label="Results">
            {state === 'loading' && !hits.teams.length ? <li className="status-line">Clock’s running…</li> : null}
            {state === 'error' ? <li className="status-line">Timeout. Try again.</li> : null}
            {state === 'done' && !items.length ? <li className="status-line">Sudden death: no match.</li> : null}
            {items.map((it, i) => (
              <li
                key={it.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                data-group={i === 0 || items[i - 1].group !== it.group ? it.group : undefined}
                onMouseMove={() => setActive(i)}
                onClick={() => choose(it)}
              >
                {it.team ? <Avatar team={it.team.number} year={year} /> : null}
                <span className={it.team ? 'num' : undefined}>{it.label}</span>
                {it.hint ? <span className="hint">{it.hint}</span> : null}
                {it.team ? <EdgeGauge edge={it.team.edge} size="xs" /> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </dialog>
  );
}
