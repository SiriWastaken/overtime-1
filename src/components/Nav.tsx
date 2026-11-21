'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const ITEMS = [
  { href: '/', label: 'Overview' },
  { href: '/teams', label: 'Teams' },
  { href: '/events', label: 'Events' },
  { href: '/predict', label: 'Predict a match' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/methodology', label: 'Methodology' },
  { href: '/developers', label: 'API' },
];

export function Nav() {
  const path = usePathname();
  const year = useSearchParams().get('year');
  return (
    <nav className="nav" aria-label="Primary">
      {ITEMS.map((i) => {
        const active = i.href === '/' ? path === '/' : path.startsWith(i.href);
        const keepYear = year && ['/', '/teams', '/events', '/analytics', '/predict'].includes(i.href);
        return (
          <Link key={i.href} href={keepYear ? `${i.href}?year=${year}` : i.href} aria-current={active ? 'page' : undefined}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SeasonSelect({ years, fallback }: { years: number[]; fallback: number | null }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const current = Number(params.get('year')) || fallback || '';
  if (years.length === 0) return null;
  // Season-scoped pages keep their path; entity pages (an event or match belongs to one season) go to the overview.
  const scoped = ['/', '/teams', '/events', '/analytics', '/predict'].includes(path) || path.startsWith('/teams/');
  return (
    <div className="rail-season">
      <label htmlFor="season">Season</label>
      <select
        id="season"
        value={current}
        onChange={(e) => {
          const next = new URLSearchParams(params);
          next.set('year', e.target.value);
          router.push(`${scoped ? path : '/'}?${next.toString()}`);
        }}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
