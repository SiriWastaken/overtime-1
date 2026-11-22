'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { getMyTeam, openPalette, peek, setCalm, setMyTeam, setTheme } from '@/lib/fx';
import { Avatar } from './bits';
import { EdgeGauge } from './edge';
import { useCalm, useDark } from './ui';

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
  /** toggles stay open so the new state is visible */
  keep?: boolean;
  run: () => void;
}

export const SEASONAL = ['/', '/pick', '/teams', '/events', '/analytics', '/compare', '/lab', '/accuracy', '/data'];

/** ⌘K / Ctrl+K (or "/") from anywhere: teams, events, places, settings (season, calm mode, my team). On the Teams map, a team flies the camera; elsewhere it opens the team card. */
export function Palette({ years, fallback }: { years: number[]; fallback: number | null }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const year = Number(params.get('year')) || fallback;
  const calm = useCalm();
  const dark = useDark();
  const dlg = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'all' | 'settings'>('all');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<{ teams: TeamHit[]; events: EventHit[] }>({ teams: [], events: [] });
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [active, setActive] = useState(0);

  useEffect(() => {
    const show = (m: 'all' | 'settings' = 'all') => {
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
    const onOpen = (e: Event) => show((e as CustomEvent).detail === 'settings' ? 'settings' : 'all');
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
    if (!term || mode === 'settings') {
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
    const mine = typeof document !== 'undefined' ? getMyTeam() : null;
    const more: Item[] = [
      { id: 'compare', group: 'More', label: 'Compare teams', run: go(`/compare${y}`) },
      { id: 'lab', group: 'More', label: 'Lab', hint: 'Simulator and season explorer', run: go(`/lab${y}`) },
      { id: 'accuracy', group: 'More', label: 'Track record', hint: 'How often the model is right', run: go(`/accuracy${y}`) },
      { id: 'how', group: 'More', label: 'How it works', run: go('/methodology') },
      { id: 'api', group: 'More', label: 'Data & API', run: go('/data') },
    ];
    const settings: Item[] = [
      { id: 'dark', group: 'Settings', label: 'Dark mode', hint: dark ? 'On' : 'Off', keep: true, run: () => setTheme(!dark) },
      { id: 'calm', group: 'Settings', label: 'Calm mode', hint: calm ? 'On' : 'Off', keep: true, run: () => setCalm(!calm) },
      ...(mine ? [{ id: 'unpin', group: 'Settings', label: `My team · ${mine.slice(3)}`, hint: 'Unpin', run: () => setMyTeam(null) }] : []),
      ...seasons,
      ...more,
    ];
    const t0 = q.trim().toLowerCase();
    if (mode === 'settings') return t0 ? settings.filter((i) => `${i.group} ${i.label}`.toLowerCase().includes(t0)) : settings;
    const places: Item[] = [
      { id: 'home', group: 'Go', label: 'Home', run: go(`/${y}`) },
      { id: 'pick', group: 'Go', label: 'Pick', hint: 'Alliance selection', run: go(`/pick${y}`) },
      { id: 'teams', group: 'Go', label: 'Teams', run: go(`/teams${y}`) },
      { id: 'events', group: 'Go', label: 'Events', run: go(`/events${y}`) },
      ...(mine ? [{ id: 'mine', group: 'Go', label: `My team · ${mine.slice(3)}`, run: () => peek(mine, year ?? 0) }] : []),
      { id: 'settings', group: 'Go', label: 'Settings', hint: 'Season, dark, calm', run: () => requestAnimationFrame(() => openPalette('settings')) },
      ...more,
    ];
    const term = q.trim().toLowerCase();
    if (!term) return places;
    const fly = path === '/teams' && !params.get('view');
    const teams: Item[] = hits.teams.map((t) => ({
      id: t.key,
      group: 'Teams',
      label: `${t.number}`,
      hint: t.nickname ?? '',
      team: t,
      run: fly ? () => window.dispatchEvent(new CustomEvent('ot:fly', { detail: t.number })) : () => peek(t.key, year ?? 0),
    }));
    const events: Item[] = hits.events.map((e) => ({ id: e.key, group: 'Events', label: e.name, hint: e.status === 'live' ? 'Live' : undefined, run: go(`/events/${e.key}`) }));
    const match = (i: Item) => i.label.toLowerCase().includes(term);
    return [...teams, ...events, ...places.filter(match), ...settings.filter(match)];
  }, [q, hits, mode, years, year, path, params, router, calm, dark]);

  const choose = (i: Item | undefined) => {
    if (!i) return;
    if (!i.keep) setOpen(false);
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
              aria-label={mode === 'settings' ? 'Settings' : 'Team, event or place'}
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
              placeholder={mode === 'settings' ? 'Settings' : 'Team number, name or event'}
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
            <button type="button" className="ghost small palette-close" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          <ul className="palette-list" id={listId} role="listbox" aria-label="Results">
            {state === 'loading' && !hits.teams.length ? <li className="status-line">Warming up…</li> : null}
            {state === 'error' ? <li className="status-line">Search didn’t answer. Try again.</li> : null}
            {state === 'done' && !items.length ? <li className="status-line">Nobody matches that.</li> : null}
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
