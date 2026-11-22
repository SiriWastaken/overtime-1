// EDGE for a season, computed from the stored ratings and model run (no extra storage). Cached per model run.

import { checkEdgeScale, computeEdges, edgeContext, netOf, winProbWith, type Edge, type EdgeCheckItem, type EdgeContext, type NetEstimate } from '../engine/edge.ts';
import type { TeamRating, XptsForecast } from '../engine/model.ts';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { dbPath, getDb } from './db.ts';
import { modelRun } from './queries.ts';

export interface SeasonEdges {
  runId: number;
  ctx: EdgeContext;
  byTeam: Map<string, Edge & { rank: number }>;
  /** Teams with an EDGE, best first. */
  ranked: (Edge & { rank: number })[];
  pool: Map<string, NetEstimate>;
  noise: Parameters<typeof edgeContext>[1];
}

const cache = new Map<number, SeasonEdges | null>();

export function seasonEdges(year: number): SeasonEdges | null {
  const run = modelRun(year);
  if (!run) return null;
  if (cache.has(run.id)) return cache.get(run.id)!;
  const rows = getDb().prepare('SELECT data FROM ratings WHERE year = ?').all(year) as { data: string }[];
  const pool = rows.map((r) => netOf(JSON.parse(r.data) as TeamRating));
  const noise = { totalNoiseSd: run.hyper.totalNoiseSd, marginNoiseSd: run.hyper.marginNoiseSd, offset: run.hyper.offset, scaling: run.hyper.noiseScaling };
  const ctx = edgeContext(pool, noise);
  let out: SeasonEdges | null = null;
  if (ctx) {
    const ranked = computeEdges(pool, ctx)
      .sort((a, b) => b.edge - a.edge)
      .map((e, i) => ({ ...e, rank: i + 1 }));
    out = { runId: run.id, ctx, byTeam: new Map(ranked.map((e) => [e.team, e])), ranked, pool: new Map(pool.map((p) => [p.team, p])), noise };
  }
  cache.clear(); // keep only the latest run per process
  cache.set(run.id, out);
  return out;
}

export interface Fit {
  team: string;
  /** Win-chance change from putting this robot in your alliance's next open seat instead of a median robot. */
  /** null = no rating this season yet */
  fit: number | null;
  edge: number | null;
  matches: number;
}

/**
 * Fit: EDGE re-evaluated with your alliance's filled seats pinned as partners, for the next open seat.
 * `mine` = filled seats in order (captain first). Candidates: the event roster if given, else the season's top 200
 * by EDGE (Fit order tracks EDGE closely; the cap keeps the call fast). `winChance` = your alliance today with
 * median robots in the open seats, against random alliances from the season's pool.
 */
export function allianceFit(year: number, mine: string[], opts: { roster?: string[]; exclude?: Set<string> } = {}) {
  const se = seasonEdges(year);
  if (!se) return null;
  const pinned = mine.map((t) => se.pool.get(t)).filter((p): p is NetEstimate => !!p);
  const unrated = mine.filter((t) => !se.pool.has(t));
  const pool = [...se.pool.values()];
  const median = { net: se.ctx.replacement, gross: se.ctx.replacementGross };
  // seats beyond two partners: the third robot is evaluated directly
  const ctx = pinned.length ? edgeContext(pool, se.noise, 2048, 1, pinned.slice(0, 2)) : se.ctx;
  if (!ctx) return null;
  const third = pinned[2];
  const winChance = third ? winProbWith(ctx, third.net, third.gross) : winProbWith(ctx, median.net, median.gross);
  if (pinned.length >= 3) return { winChance, fits: [] as Fit[], unrated };
  // with fewer than two pinned partners, the open seat's random partner is drawn by the context itself
  const base = winProbWith(ctx, median.net, median.gross);
  const skip = new Set([...mine, ...(opts.exclude ?? [])]);
  const keys = opts.roster ?? se.ranked.slice(0, 200).map((e) => e.team);
  const fits: Fit[] = keys
    .filter((k) => !skip.has(k))
    .map((k) => {
      const p = se.pool.get(k);
      return { team: k, fit: p ? winProbWith(ctx, p.net, p.gross) - base : null, edge: se.byTeam.get(k)?.edge ?? null, matches: p?.matches ?? 0 };
    })
    .sort((a, b) => (b.fit ?? -9) - (a.fit ?? -9) || Number(a.team.slice(3)) - Number(b.team.slice(3)));
  return { winChance, fits, unrated };
}

/** Walk-forward check of EDGE's scale on a season's stored pre-match forecasts (eligible ones only). */
export function edgeScaleCheck(year: number) {
  const rows = getDb()
    .prepare(
      `SELECT p.cutoff, p.red_win_prob, p.data, m.winner, m.comp_level FROM predictions p JOIN matches m ON m.key = p.match_key
       WHERE p.year = ? AND p.kind = 'pre_match' AND p.eligible = 1 AND m.winner IS NOT NULL`
    )
    .all(year) as { cutoff: number; red_win_prob: number; data: string; winner: string; comp_level: string }[];
  const items: EdgeCheckItem[] = rows.map((r) => {
    const f = JSON.parse(r.data) as XptsForecast;
    return {
      t: r.cutoff,
      red: f.red.teams,
      blue: f.blue.teams,
      level: (f.redMean + f.blueMean) / 2,
      noiseVar: f.marginSd ** 2 - f.marginParamVar,
      y: r.winner === 'red' ? 1 : r.winner === 'blue' ? 0 : 0.5,
      xptsRedWinProb: r.red_win_prob,
      playoff: r.comp_level !== 'qm',
    };
  });
  return { year, run: modelRun(year)?.id ?? null, version: modelRun(year)?.version ?? null, matches: items.length, ...checkEdgeScale(items) };
}

export type EdgeCheckFile = ReturnType<typeof edgeScaleCheck> & { generatedAt: number };

/** Stored results of `node scripts/edge.ts <year>`, newest season first. Empty when the check has not been run. */
export function edgeCheckResults(): EdgeCheckFile[] {
  const dir = dirname(dbPath());
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => /^edge-check-\d{4}\.json$/.test(f));
  } catch {
    return [];
  }
  return files
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as EdgeCheckFile)
    .sort((a, b) => b.year - a.year);
}
