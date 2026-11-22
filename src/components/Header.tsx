'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { openPalette, setCalm, setTheme } from '@/lib/fx';
import { ICONS, PLACES, usePlaces } from './Nav';
import { SEASONAL } from './Palette';
import { Logo, useCalm, useDark } from './ui';

/** The one top bar: logo, the places (desktop), search, season, dark and Calm. Phones keep logo, search and Settings. */
export function Header({ years, fallback }: { years: number[]; fallback: number | null }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const year = Number(sp.get('year')) || fallback || years[0];
  const calm = useCalm();
  const dark = useDark();
  const { href, on } = usePlaces();

  const pickYear = (y: number) => {
    const p = new URLSearchParams(sp.toString());
    p.set('year', String(y));
    const scoped = SEASONAL.some((s) => (s === '/' ? path === '/' : path.startsWith(s))) || path.startsWith('/teams/');
    router.push(`${scoped ? path : '/'}?${p}`);
  };

  return (
    <header className="bar">
      <Link href={href('/')} className="bar-brand" aria-label="Overtime 1, home">
        <Logo />
        <span>Overtime 1</span>
      </Link>
      <nav className="bar-places" aria-label="Primary">
        {PLACES.slice(1).map(([h, label]) => (
          <Link key={h} href={href(h)} aria-current={on(h) ? 'page' : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      <button type="button" className="bar-search" onClick={() => openPalette()} aria-keyshortcuts="Meta+K Control+K /">
        {ICONS.search}
        <span>Find a team or event</span>
        <kbd aria-hidden>⌘K</kbd>
      </button>
      <label className="sr-only" htmlFor="season">
        Season
      </label>
      <select id="season" className="bar-season" value={year ?? ''} onChange={(e) => pickYear(Number(e.target.value))}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <button type="button" className="bar-toggle" aria-pressed={dark} onClick={() => setTheme(!dark)}>
        Dark
      </button>
      <button type="button" className="bar-toggle" aria-pressed={calm} onClick={() => setCalm(!calm)}>
        Calm
      </button>
      <button type="button" className="bar-more" onClick={() => openPalette('settings')} aria-label="Settings: season, dark, calm">
        {ICONS.settings}
      </button>
    </header>
  );
}
