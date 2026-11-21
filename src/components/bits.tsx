import Link from 'next/link';
import { pct, teamNum } from '@/lib/format';
import type { TeamMeta } from '@/lib/queries';

export function TeamLink({ team, meta, year, name = true }: { team: string; meta?: TeamMeta | null; year?: number; name?: boolean }) {
  return (
    <Link className="team" href={`/teams/${teamNum(team)}${year ? `?year=${year}` : ''}`}>
      <span className="team-num">{teamNum(team)}</span>
      {name && meta?.nickname ? <span className="team-name">{meta.nickname}</span> : null}
    </Link>
  );
}

/** Red/blue split bar. Labels carry the numbers so colour is never the only cue. */
export function WinBar({ p, small = false }: { p: number; small?: boolean }) {
  const r = Math.min(Math.max(p, 0), 1);
  return (
    <span className={`winbar${small ? ' small' : ''}`} role="img" aria-label={`Red ${pct(r)}, blue ${pct(1 - r)}`}>
      <span className="r" style={{ width: `${r * 100}%` }}>
        {r >= 0.2 ? pct(r) : ''}
      </span>
      <span className="b" style={{ width: `${(1 - r) * 100}%` }}>
        {r <= 0.8 ? pct(1 - r) : ''}
      </span>
    </span>
  );
}

/** Mean with a hatched uncertainty band, on a scale shared by every row of the table. */
export function RangeBar({ mean, sd, max, min = 0 }: { mean: number; sd: number; max: number; min?: number }) {
  const span = max - min || 1;
  const x = (v: number) => `${Math.min(Math.max(((v - min) / span) * 100, 0), 100)}%`;
  const lo = mean - 1.2816 * sd;
  const hi = mean + 1.2816 * sd;
  return (
    <div className="hbar" aria-hidden>
      <i style={{ width: x(mean) }} />
      <b style={{ left: x(lo), width: `calc(${x(hi)} - ${x(lo)})` }} />
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function NoData({ year }: { year: number | null }) {
  return (
    <div className="notice">
      <strong>No {year ?? ''} data synced yet.</strong> Overtime 1 shows only real data from The Blue Alliance. Set <code>TBA_API_KEY</code> in{' '}
      <code>.env.local</code>, then run <code>npm run update -- {year ?? new Date().getFullYear()}</code> (sync and model). The server also refreshes the current season
      automatically when a key is configured.
    </div>
  );
}
