// EDGE for a season, computed from the stored ratings and model run (no extra storage). Cached per model run.

import { checkEdgeScale, computeEdges, edgeContext, netOf, type Edge, type EdgeCheckItem, type EdgeContext } from '../engine/edge.ts';
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
    out = { runId: run.id, ctx, byTeam: new Map(ranked.map((e) => [e.team, e])), ranked };
  }
  cache.clear(); // keep only the latest run per process
  cache.set(run.id, out);
  return out;
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
