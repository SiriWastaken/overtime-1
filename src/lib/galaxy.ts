// Per-season "form" (recent rating path) and the galaxy point cloud. Derived from stored ratings; cached per model run.

import { getDb } from './db.ts';
import { seasonEdges } from './edge.ts';
import { modelRun, teamRatings } from './queries.ts';

const SPARK = 12; // points kept per team for sparklines
export const TREND_SPAN = 10; // matches back for the trend

export interface Form {
  /** Last SPARK post-match scoring means, oldest first. */
  spark: number[];
  /** Change in scoring over the last TREND_SPAN matches, in season-spread units (sd of team scoring). */
  trend: number;
  /** The same change in points per match. */
  delta: number;
}

/** Columnar so ~4000 teams stay small on the wire. */
export interface GalaxyData {
  year: number;
  n: number[];
  name: string[];
  /** Defense: opponents' points prevented per match. */
  x: number[];
  /** Scoring: own points per match. */
  y: number[];
  e: (number | null)[];
  /** −1 cooling, 0 steady, 1 heating up. */
  t: number[];
}

const cache = new Map<string, unknown>();
function cached<T>(year: number, kind: string, make: () => T): T | null {
  const run = modelRun(year);
  if (!run) return null;
  const k = `${kind}:${run.id}`;
  if (!cache.has(k)) cache.set(k, make());
  return cache.get(k) as T;
}

export function seasonForm(year: number): Map<string, Form> {
  return (
    cached(year, 'form', () => {
      const rows = getDb().prepare('SELECT team_key, mean FROM rating_history WHERE year = ? ORDER BY team_key, t').all(year) as { team_key: string; mean: number }[];
      const by = new Map<string, number[]>();
      for (const r of rows) {
        const a = by.get(r.team_key);
        if (a) a.push(r.mean);
        else by.set(r.team_key, [r.mean]);
      }
      const lasts = [...by.values()].map((a) => a[a.length - 1]);
      const mu = lasts.reduce((s, v) => s + v, 0) / Math.max(lasts.length, 1);
      const sd = Math.sqrt(lasts.reduce((s, v) => s + (v - mu) ** 2, 0) / Math.max(lasts.length - 1, 1)) || 1;
      const out = new Map<string, Form>();
      for (const [k, a] of by) {
        const last = a[a.length - 1];
        const prev = a[Math.max(0, a.length - 1 - TREND_SPAN)];
        out.set(k, { spark: a.slice(-SPARK).map((v) => Math.round(v * 10) / 10), trend: (last - prev) / sd, delta: last - prev });
      }
      return out;
    }) ?? new Map()
  );
}

/** Ring on the star / sparkline tint when form moved by more than this many season-spreads. */
export const TREND_RING = 0.35;

export function galaxy(year: number): GalaxyData | null {
  return cached(year, 'galaxy', () => {
    const edges = seasonEdges(year)?.byTeam;
    const form = seasonForm(year);
    const d: GalaxyData = { year, n: [], name: [], x: [], y: [], e: [], t: [] };
    for (const r of teamRatings(year).rows) {
      const tr = form.get(r.key)?.trend ?? 0;
      d.n.push(r.number);
      d.name.push(r.nickname ?? '');
      d.x.push(Math.round((r.rating.defense?.mean ?? 0) * 10) / 10);
      d.y.push(Math.round(r.rating.total.mean * 10) / 10);
      const e = edges?.get(r.key)?.edge;
      d.e.push(e === undefined ? null : Math.round(e * 1000) / 1000);
      d.t.push(tr > TREND_RING ? 1 : tr < -TREND_RING ? -1 : 0);
    }
    return d;
  });
}
