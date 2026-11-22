'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { openPalette, setCalm } from '@/lib/fx';
import { SEASONAL } from './Palette';
import { Logo, useCalm } from './ui';

export function Header({ years, fallback }: { years: number[]; fallback: number | null }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const yearParam = sp.get('year');
  const currentYear = Number(yearParam) || fallback || 2026;
  const calm = useCalm();

  const handleYearChange = (newYear: number) => {
    const params = new URLSearchParams(sp.toString());
    params.set('year', String(newYear));
    // If current route is seasonal, stay on route with new year parameter
    const base = SEASONAL.some((s) => (s === '/' ? path === '/' : path.startsWith(s))) ? path : '/';
    router.push(`${base}?${params.toString()}`);
  };

  return (
    <header className="top-header" role="banner">
      <div className="header-left">
        <Link href={`/?year=${currentYear}`} className="header-brand" aria-label="Overtime 1">
          <Logo />
          <span className="brand-name">Overtime 1</span>
        </Link>
        <span className="brand-tagline hide-m">FRC Data &amp; Verified Models</span>
      </div>

      <div className="header-center">
        <button
          type="button"
          className="header-search-box"
          onClick={() => openPalette()}
          aria-label="Search teams and events (Shortcut: ⌘K)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span className="search-placeholder">Find team, event, match...</span>
          <kbd className="search-kbd hide-s">⌘K</kbd>
        </button>
      </div>

      <div className="header-right">
        <div className="season-selector" title="Select FRC season">
          <label htmlFor="season-picker" className="sr-only">Season</label>
          <select
            id="season-picker"
            className="season-select"
            value={currentYear}
            onChange={(e) => handleYearChange(Number(e.target.value))}
            aria-label="Season selection"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y} Season
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className={`calm-toggle-btn${calm ? ' active' : ''}`}
          onClick={() => setCalm(!calm)}
          title={calm ? 'Calm mode is ON (no motion). Tap to toggle.' : 'Calm mode is OFF. Tap for reduced motion.'}
          aria-label="Toggle calm mode"
        >
          {calm ? 'Calm: On' : 'Calm: Off'}
        </button>
      </div>
    </header>
  );
}
