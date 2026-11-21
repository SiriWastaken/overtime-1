import Link from 'next/link';
import { seasonSpec, type Phase } from '@/engine/seasons';
import type { TeamRating } from '@/engine/model';
import { pts } from '@/lib/format';
import type { RatedTeam } from '@/lib/queries';
import { RangeBar, TeamLink } from './bits';

export function phaseRating(year: number, r: TeamRating, phase: Phase) {
  let mean = 0;
  let v = 0;
  for (const c of seasonSpec(year).components)
    if (c.phase === phase && r.components[c.id]) {
      mean += r.components[c.id].mean;
      v += r.components[c.id].sd ** 2;
    }
  return { mean, sd: Math.sqrt(v) };
}

export const PHASE_COLS: { id: Phase; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'teleop', label: 'Teleop' },
  { id: 'endgame', label: 'Endgame' },
];

export type SortKey = 'net' | 'auto' | 'teleop' | 'endgame' | 'def' | 'fouls' | 'sd' | 'vol' | 'matches';

export function sortRows(year: number, rows: RatedTeam[], key: SortKey) {
  const val = (r: RatedTeam): number => {
    switch (key) {
      case 'auto':
      case 'teleop':
      case 'endgame':
        return phaseRating(year, r.rating, key).mean;
      case 'fouls':
        return -r.rating.fouls.mean;
      case 'def':
        return r.rating.defense?.mean ?? 0;
      case 'sd':
        return -r.rating.total.sd;
      case 'vol':
        return -r.rating.volatility;
      case 'matches':
        return r.rating.matches;
      default:
        return r.rating.net;
    }
  };
  return [...rows].sort((a, b) => val(b) - val(a));
}

export function RatingsTable({ year, rows, sort, sortHref, compact = false }: { year: number; rows: RatedTeam[]; sort?: SortKey; sortHref?: (k: SortKey) => string; compact?: boolean }) {
  const spec = seasonSpec(year);
  const phases = PHASE_COLS.filter((p) => spec.components.some((c) => c.phase === p.id));
  const scaleMax = Math.max(1, ...rows.slice(0, 400).map((r) => r.rating.total.mean + 1.3 * r.rating.total.sd));
 const H = ({ k, children, title, m = false }: { k: SortKey; children: React.ReactNode; title?: string; m?: boolean }) => (
    <th className={`n${m ? ' hide-m' : ''}`} scope="col" title={title} aria-sort={sort === k ? 'descending' : undefined}>
      {sortHref ? (
        <Link href={sortHref(k)} aria-current={sort === k ? 'true' : undefined}>
          {children}
        </Link>
      ) : (
        children
      )}
    </th>
  );
  return (
    <div className="table-wrap">
      <table className="agate">
        <thead>
          <tr>
            <th scope="col" className="rank">
              #
            </th>
            <th scope="col">Team</th>
            <H k="net" title="Expected net points per match: scoring contribution minus foul points conceded">
              xPts
            </H>
            {!compact ? (
              <th scope="col" className="hide-m" style={{ minWidth: 120 }}>
                Contribution, 80% range
              </th>
            ) : null}
            {phases.map((p, i) => (
              <H key={p.id} k={p.id} m={i > 1}>
                {p.label}
              </H>
            ))}
            {rows.some((r) => r.rating.defense) ? (
              <H k="def" m title="Estimated reduction in opponents' scoring per match (defence, field control, denied game pieces)">
                Opp. supp.
              </H>
            ) : null}
            <H k="fouls" m title="Foul points conceded to opponents per match">
              Fouls
            </H>
            {!compact ? (
              <>
                <H k="sd" title="Posterior SD of the scoring contribution (lower = more certain)">
                  ±SD
                </H>
                <H k="vol" title="Observed vs expected forecast error for this team's alliances; 1.0 = as expected, higher = less consistent">
                  Volatility
                </H>
              </>
            ) : null}
            <H k="matches" m>
              Played
            </H>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="rank n">{r.rank}</td>
              <td>
                <TeamLink team={r.key} meta={r} year={year} />
              </td>
              <td className="n strong">{pts(r.rating.net, 1)}</td>
              {!compact ? (
                <td className="bar-cell hide-m">
                  <RangeBar mean={r.rating.total.mean} sd={r.rating.total.sd} max={scaleMax} />
                </td>
              ) : null}
              {phases.map((p, i) => (
                <td key={p.id} className={`n${i > 1 ? ' hide-m' : ''}`}>
                  {pts(phaseRating(year, r.rating, p.id).mean, 1)}
                </td>
              ))}
              {rows.some((x) => x.rating.defense) ? <td className="n muted hide-m">{r.rating.defense ? pts(r.rating.defense.mean, 1) : '—'}</td> : null}
              <td className="n muted hide-m">{pts(r.rating.fouls.mean, 1)}</td>
              {!compact ? (
                <>
                  <td className="n muted">{pts(r.rating.total.sd, 1)}</td>
                  <td className="n muted">{r.rating.volatility.toFixed(2)}</td>
                </>
              ) : null}
              <td className="n muted hide-m">{r.rating.matches}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
