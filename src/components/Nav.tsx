'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { SEASONAL } from './Palette';

const I = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

export const ICONS = {
  home: (
    <svg {...I}>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
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

export const PLACES = [
  ['/', 'Home', 'home'],
  ['/pick', 'Pick', 'pick'],
  ['/teams', 'Teams', 'teams'],
  ['/events', 'Events', 'events'],
] as const;

/** Keeps ?year= on seasonal links, marks the current place. Shared by the top bar and the phone tabs. */
export function usePlaces() {
  const path = usePathname();
  const yp = useSearchParams().get('year');
  const href = (h: string) => (yp && SEASONAL.includes(h) ? `${h}?year=${yp}` : h);
  const on = (h: string) => (h === '/' ? path === '/' : path.startsWith(h));
  return { href, on };
}

/** Phones: a bottom tab bar with the four places. Desktop uses the top bar's links. */
export function Tabs() {
  const { href, on } = usePlaces();
  return (
    <nav className="dock" aria-label="Primary">
      {PLACES.map(([h, label, icon]) => (
        <Link key={h} href={href(h)} className="dock-item" aria-current={on(h) ? 'page' : undefined}>
          {ICONS[icon]}
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
