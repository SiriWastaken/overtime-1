import Link from 'next/link';
import { seasonSpec, type Phase } from '@/engine/seasons';
import type { TeamRating } from '@/engine/model';
import { pts } from '@/lib/format';
import type { RatedTeam } from '@/lib/queries';
import type { Edge } from '@/engine/edge';
import { TREND_RING, type Form } from '@/lib/galaxy';
import { Spark, TeamLink } from './bits';
import { EdgeGauge } from './edge';
import { FlipBody } from './FlipBody';

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

export type SortKey = 'edge' | 'net' | 'auto' | 'teleop' | 'endgame' | 'def' | 'fouls' | 'matches';

export function sortRows(year: number, rows: RatedTeam[], key: SortKey, edges?: Map<string, Edge>) {
  const val = (r: RatedTeam): number => {
    switch (key) {
      case 'edge':
        return edges?.get(r.key)?.edge ?? -Infinity;
      case 'auto':
      case 'teleop':
      case 'endgame':
        return phaseRating(year, r.rating, key).mean;
      case 'fouls':
        return -r.rating.fouls.mean;
      case 'def':
        return r.rating.defense?.mean ?? 0;
      case 'matches':
        return r.rating.matches;
      default:
        return r.rating.net;
    }
  };
  return [...rows].sort((a, b) => val(b) - val(a));
}

/** Dense team rows: EDGE gauge, recent form, xPts, phases. "My team" stays pinned under the header. */
export function RatingsTable({
  year,
  rows,
  edges,
  form,
  mine,
  sort,
  sortHref,
  compact = false,
}: {
  year: number;
  rows: RatedTeam[];
  edges?: Map<string, Edge & { rank: number }>;
  form?: Map<string, Form>;
  mine?: RatedTeam | null;
  sort?: SortKey;
  sortHref?: (k: SortKey) => string;
  compact?: boolean;
}) {
  const spec = seasonSpec(year);
  const phases = PHASE_COLS.filter((p) => spec.components.some((c) => c.phase === p.id));
  const hasDef = rows.some((r) => r.rating.defense);
  const H = ({ k, children, title, m = false, cls = '' }: { k: SortKey; children: React.ReactNode; title?: string; m?: boolean; cls?: string }) => (
    <th className={`n${m ? ' hide-m' : ''} ${cls}`} scope="col" title={title} aria-sort={sort === k ? 'descending' : undefined}>
      {sortHref ? (
        <Link href={sortHref(k)} aria-current={sort === k ? 'true' : undefined}>
          {children}
        </Link>
      ) : (
        children
      )}
    </th>
  );
  const row = (r: RatedTeam, pinned = false) => {
    const e = edges?.get(r.key);
    const f = form?.get(r.key);
    return (
      <tr key={pinned ? 'mine' : r.key} className={pinned ? 'mine' : undefined} data-peek={r.key} data-year={year}>
        <td className="rank n">{pinned ? <span className="you">You</span> : (e?.rank ?? r.rank)}</td>
        <td>
          <TeamLink team={r.key} meta={r} year={year} rank={pinned ? null : (e?.rank ?? r.rank)} />
        </td>
        {edges ? (
          <td className="gauge-cell">
            <EdgeGauge edge={e?.edge} lo={compact ? undefined : e?.lo80} hi={compact ? undefined : e?.hi80} matches={e?.matches} />
          </td>
        ) : null}
        {form ? (
          <td className="hide-m">
            <Spark values={f?.spark} trend={f ? (f.trend > TREND_RING ? 1 : f.trend < -TREND_RING ? -1 : 0) : 0} />
          </td>
        ) : null}
        <td className="n">{pts(r.rating.net, 1)}</td>
        {phases.map((p, i) => (
          <td key={p.id} className={`n muted${i > 1 ? ' hide-m' : ''}`}>
            {pts(phaseRating(year, r.rating, p.id).mean, 1)}
          </td>
        ))}
        {hasDef ? <td className="n muted hide-m">{r.rating.defense ? pts(r.rating.defense.mean, 1) : '—'}</td> : null}
        <td className="n muted hide-m">{pts(r.rating.fouls.mean, 1)}</td>
        <td className="n muted hide-m">{r.rating.matches}</td>
      </tr>
    );
  };
  return (
    <div className="table-wrap">
      <table className="agate dense">
        <thead>
          <tr>
            <th scope="col" className="rank">
              #
            </th>
            <th scope="col">Team</th>
            {edges ? (
              <H k="edge" cls="gauge-cell" title="Wins per 100 matches vs a median robot. Left of centre hurts, right helps.">
                EDGE
              </H>
            ) : null}
            {form ? (
              <th scope="col" className="hide-m" title="Scoring estimate over the last 12 matches">
                Recent scoring
              </th>
            ) : null}
            <H k="net" title="Points added to the alliance margin per match (xPts)">
              Points added
            </H>
            {phases.map((p, i) => (
              <H key={p.id} k={p.id} m={i > 1}>
                {p.label}
              </H>
            ))}
            {hasDef ? (
              <H k="def" m title="Opponents' points prevented per match">
                Defense
              </H>
            ) : null}
            <H k="fouls" m title="Foul points given away per match">
              Fouls
            </H>
            <H k="matches" m>
              Played
            </H>
          </tr>
          {mine ? row(mine, true) : null}
        </thead>
        <FlipBody>{rows.map((r) => row(r))}</FlipBody>
      </table>
    </div>
  );
}
