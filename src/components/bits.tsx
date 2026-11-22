import { Mascot } from './Mascot';
import Link from 'next/link';
import { pct, teamNum } from '@/lib/format';
import type { TeamMeta } from '@/lib/queries';
import { hot } from './edge';

/** The team's FIRST avatar (via TBA); a transparent placeholder when there isn't one, so rows stay aligned. */
export function Avatar({ team, year, size = 20 }: { team: string | number; year?: number | null; size?: number }) {
  if (!year) return null;
  const n = String(team).replace(/^frc/, '');
  return <img className="avatar" src={`/api/v1/avatars/${n}?year=${year}`} width={size} height={size} alt="" loading="lazy" decoding="async" />;
}

/** Team number (accent only for the season's top 10 by EDGE) and nickname. */
export function TeamLink({ team, meta, year, name = true, rank }: { team: string; meta?: TeamMeta | null; year?: number; name?: boolean; rank?: number | null }) {
  return (
    <Link className="team" href={`/teams/${teamNum(team)}${year ? `?year=${year}` : ''}`}>
      <Avatar team={team} year={year} />
      <span className={`team-num${hot(rank)}`}>
        {teamNum(team)}
      </span>
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

/** Recent form: the last few post-match scoring estimates. Tinted when the trend is clear. */
export function Spark({ values, trend = 0 }: { values?: number[]; trend?: number }) {
  if (!values || values.length < 2) return <span className="spark-line none" aria-hidden />;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 60).toFixed(1)},${(16 - ((v - lo) / (hi - lo || 1)) * 14).toFixed(1)}`).join(' ');
  return (
    <svg className={`spark-line${trend > 0 ? ' up' : trend < 0 ? ' down' : ''}`} viewBox="0 0 60 18" width="60" height="18" role="img" aria-label={trend > 0 ? 'Heating up' : trend < 0 ? 'Cooling off' : 'Steady'}>
      <polyline points={pts} fill="none" />
    </svg>
  );
}

export function NoData({ year }: { year: number | null }) {
  return (
    <div className="empty">
      <Mascot mood="think" />
      <strong>No data for {year ?? 'this season'} yet.</strong>
      Sync it first: <code>npm run update -- {year ?? new Date().getFullYear()}</code>
    </div>
  );
}
