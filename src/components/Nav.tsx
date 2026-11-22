'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { openPalette } from '@/lib/fx';
import { SEASONAL } from './Palette';
import { Logo } from './ui';

const I = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

const ICONS = {
  home: (
    <svg {...I}>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  teams: (
    <svg {...I}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <circle cx="17" cy="9" r="2.75" />
      <path d="M16 14.2a5 5 0 0 1 5.5 5" />
    </svg>
  ),
  events: (
    <svg {...I}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  compare: (
    <svg {...I}>
      <path d="M16 3h5v5" />
      <path d="M8 21H3v-5" />
      <path d="M21 3l-7 7" />
      <path d="M3 21l7-7" />
    </svg>
  ),
  lab: (
    <svg {...I}>
      <path d="M10 2v7.5L5.2 19.1A2 2 0 0 0 7 22h10a2 2 0 0 0 1.8-2.9L14 9.5V2" />
      <path d="M8.5 2h7" />
      <path d="M7 16h10" />
    </svg>
  ),
  accuracy: (
    <svg {...I}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  data: (
    <svg {...I}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),
  search: (
    <svg {...I}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  settings: (
    <svg {...I}>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  ),
};

/** Primary navigation: Teams, Events, Compare, Lab, Accuracy, Data, Search. */
export function Rail({ fallback }: { fallback: number | null }) {
  const path = usePathname();
  const yp = useSearchParams().get('year');
  const year = Number(yp) || fallback;
  const href = (h: string) => (yp && SEASONAL.includes(h) ? `${h}?year=${yp}` : h);
  const on = (h: string) => (h === '/' ? path === '/' : path.startsWith(h));

  const item = (h: string, label: string, icon: React.ReactNode) => (
    <Link href={href(h)} className="rail-item" aria-current={on(h) ? 'page' : undefined}>
      {icon}
      <span>{label}</span>
    </Link>
  );

  return (
    <nav className="rail" aria-label="Primary navigation">
      <Link href={href('/')} className="rail-logo" aria-label="Overtime 1 Home">
        <Logo />
      </Link>
      {item('/', 'Home', ICONS.home)}
      {item('/teams', 'Teams', ICONS.teams)}
      {item('/events', 'Events', ICONS.events)}
      {item('/compare', 'Compare', ICONS.compare)}
      {item('/lab', 'Lab', ICONS.lab)}
      {item('/accuracy', 'Accuracy', ICONS.accuracy)}
      {item('/data', 'Data', ICONS.data)}
      <span className="rail-gap" aria-hidden />
      <button
        type="button"
        className="rail-item search-btn"
        onClick={() => openPalette()}
        aria-label="Search teams and events (⌘K)"
      >
        {ICONS.search}
        <span>Search</span>
      </button>
      <button
        type="button"
        className="rail-item"
        onClick={() => openPalette('settings')}
        aria-label={`Settings. Season ${year ?? 'none'}`}
      >
        {ICONS.settings}
        <span>Settings</span>
      </button>
    </nav>
  );
}
