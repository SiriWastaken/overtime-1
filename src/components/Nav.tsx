'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { openPalette } from '@/lib/fx';
import { SEASONAL } from './Palette';
import { CalmToggle, Logo } from './ui';

const I = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

const ICONS = {
  teams: (
    <svg {...I}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <circle cx="17" cy="9" r="2.75" />
      <path d="M16 14.2a5 5 0 0 1 5.5 5" />
    </svg>
  ),
  pick: (
    <svg {...I}>
      <path d="M12 4.5 5 18h14z" strokeDasharray="2.2 2.4" />
      <circle cx="12" cy="4.5" r="2.2" fill="currentColor" />
      <circle cx="5" cy="18" r="2.2" fill="currentColor" />
      <circle cx="19" cy="18" r="2.2" fill="currentColor" />
    </svg>
  ),
  predict: (
    <svg {...I}>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 13.5V9.5M10 2.5h4M12 2.5V6M18.5 6.5l1.5-1.5" />
    </svg>
  ),
  directory: (
    <svg {...I}>
      <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  ),
  search: (
    <svg {...I}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5 5" />
    </svg>
  ),
  calm: (
    <svg {...I}>
      <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" />
    </svg>
  ),
};

const DIRECTORY = ['/directory', '/events', '/matches', '/analytics', '/methodology', '/developers', '/styleguide'];

/** Left icon rail on desktop; the same links become a bottom dock on phones. The palette (⌘K) is the fast path. */
export function Rail({ fallback }: { fallback: number | null }) {
  const path = usePathname();
  const yp = useSearchParams().get('year');
  const year = Number(yp) || fallback;
  const href = (h: string) => (yp && SEASONAL.includes(h) ? `${h}?year=${yp}` : h);
  const on = (h: string) =>
    h === '/' ? path === '/' : h === '/teams' ? path.startsWith('/teams') : h === '/directory' ? DIRECTORY.some((d) => path.startsWith(d)) : path.startsWith(h);
  const item = (h: string, label: string, icon: React.ReactNode, cls = '') => (
    <Link href={href(h)} className={`rail-item ${cls}`} aria-current={on(h) ? 'page' : undefined}>
      {icon}
      <span>{label}</span>
    </Link>
  );
  return (
    <nav className="rail" aria-label="Primary">
      {item('/', 'Explore', <Logo />, 'explore')}
      {item('/teams', 'Teams', ICONS.teams)}
      <button type="button" className="rail-item rail-find" onClick={() => openPalette()} aria-keyshortcuts="Control+K Meta+K /">
        {ICONS.search}
        <span>Find</span>
      </button>
      {item('/pick', 'Pick', ICONS.pick)}
      {item('/predict', 'Predict', ICONS.predict)}
      <span className="rail-gap" aria-hidden />
      <div className="rail-foot">
        {item('/directory', 'Directory', ICONS.directory)}
        <button type="button" className="rail-item season" onClick={() => openPalette('season')} aria-label={`Season ${year ?? ''}. Change season`}>
          <b>{year ? `’${String(year).slice(2)}` : '—'}</b>
          <span>Season</span>
        </button>
        <CalmToggle className="rail-item calm">
          {ICONS.calm}
          <span>Calm</span>
        </CalmToggle>
      </div>
    </nav>
  );
}
