// EDGE: the expected change in an alliance's win probability from fielding this robot instead of a
// replacement-level robot, averaged over the partners and opponents it could realistically face.
//
// It is a deterministic transform of the xPts posterior (no new fitted parameters):
//   net_i      posterior mean of the robot's effect on its alliance's margin (scoring − fouls given + defense)
//   r          replacement baseline: the median net of the season's rated robots
//   D_k        a context: Σ two partners − Σ three opponents, drawn from the same rated pool
//   σ_k²       margin noise at that match's scoring level (engine/forecast.ts scale) + the context
//              robots' mean posterior variance
//   EDGE_i   = mean_k [ Φ((D_k + net_i)/σ_k(i)) − Φ((D_k + r)/σ_k(r)) ]
// The 80% interval re-evaluates EDGE at net_i ± z·sd_i with the scoring level held fixed (EDGE is increasing in
// net at a fixed level), so it reflects uncertainty in the robot's rating, not in the season's noise estimates.
// xPts is additive (no partner interactions), so EDGE does not capture synergy or complementarity.
// See docs/EDGE.md for the definition, assumptions and validation.

import { scale, type Noise } from './forecast.ts';
import { normalCdf, rng, Z80 } from './stats.ts';

export interface NetEstimate {
  team: string;
  /** Posterior mean effect on alliance margin, points per match. */
  net: number;
  /** Posterior sd of net. */
  sd: number;
  /** Points the robot adds to the match's total scoring level: own scoring + fouls given − points defended. */
  gross: number;
  matches: number;
}

export interface EdgeContext {
  /** Replacement baseline net (median of the pool). */
  replacement: number;
  replacementGross: number;
  /** Sampled context margins (partners − opponents). */
  contexts: Float64Array;
  /** Sampled context scoring (both alliances, five robots plus the match offset), for level-dependent noise. */
  gross: Float64Array;
  /** Context robots' summed posterior variance (five robots). */
  paramVar: number;
  noise: Noise;
  poolSize: number;
}

export interface Edge {
  team: string;
  /** Expected win-probability change vs the replacement robot (0.13 = +13 percentage points). */
  edge: number;
  lo80: number;
  hi80: number;
  net: number;
  netSd: number;
  matches: number;
}

/** Robots with fewer matches than this do not enter the pool that defines the baseline and the contexts. */
export const MIN_POOL_MATCHES = 3;
/** Below this many matches EDGE is shown as provisional. */
export const MIN_RELIABLE_MATCHES = 8;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Build the evaluation context from the season pool. Uses common random numbers (fixed seed) so every robot is
 * scored against identical contexts and differences between robots are not Monte Carlo noise.
 */
export function edgeContext(pool: NetEstimate[], noise: Noise, samples = 2048, seed = 1): EdgeContext | null {
  const eligible = pool.filter((p) => p.matches >= MIN_POOL_MATCHES && Number.isFinite(p.net) && Number.isFinite(p.gross));
  if (eligible.length < 12 || !(noise.marginNoiseSd > 0)) return null;
  const meanVar = eligible.reduce((a, p) => a + p.sd * p.sd, 0) / eligible.length;
  const rand = rng(seed);
  const pick = () => eligible[Math.floor(rand() * eligible.length)];
  const contexts = new Float64Array(samples);
  const gross = new Float64Array(samples);
  for (let k = 0; k < samples; k++) {
    const [a, b, c, d, e] = [pick(), pick(), pick(), pick(), pick()];
    contexts[k] = a.net + b.net - c.net - d.net - e.net;
    gross[k] = a.gross + b.gross + c.gross + d.gross + e.gross + 2 * noise.offset;
  }
  return {
    replacement: median(eligible.map((p) => p.net)),
    replacementGross: median(eligible.map((p) => p.gross)),
    contexts,
    gross,
    paramVar: 5 * meanVar,
    noise,
    poolSize: eligible.length,
  };
}

/** Margin noise variance at a match level (mean alliance score), with the same scaling as match forecasts. */
const marginNoiseVar = (n: Noise, level: number) => n.marginNoiseSd ** 2 * scale(n, level, n.scaling?.marginP ?? 0);

/** Expected win probability of an alliance containing a robot with this net and gross, over the sampled contexts. */
export function winProbWith(ctx: EdgeContext, net: number, gross: number): number {
  let s = 0;
  for (let k = 0; k < ctx.contexts.length; k++) {
    const sd = Math.sqrt(ctx.paramVar + marginNoiseVar(ctx.noise, (ctx.gross[k] + gross) / 2));
    s += normalCdf((ctx.contexts[k] + net) / sd);
  }
  return s / ctx.contexts.length;
}

export function computeEdges(pool: NetEstimate[], ctx: EdgeContext): Edge[] {
  const base = winProbWith(ctx, ctx.replacement, ctx.replacementGross);
  return pool.map((p) => {
    const at = (x: number) => winProbWith(ctx, x, p.gross) - base;
    return { team: p.team, edge: at(p.net), lo80: at(p.net - Z80 * p.sd), hi80: at(p.net + Z80 * p.sd), net: p.net, netSd: p.sd, matches: p.matches };
  });
}

/** Net effect on margin and its sd from a stored rating. Components are treated as independent (marginal posteriors). */
export function netOf(r: {
  team: string;
  net: number;
  total: { mean: number; sd: number };
  fouls: { mean: number; sd: number };
  defense: { mean: number; sd: number } | null;
  matches: number;
}): NetEstimate {
  const def = r.defense ?? { mean: 0, sd: 0 };
  return { team: r.team, net: r.net, sd: Math.sqrt(r.total.sd ** 2 + r.fouls.sd ** 2 + def.sd ** 2), gross: r.total.mean + r.fouls.mean - def.mean, matches: r.matches };
}

// ---------------------------------------------------------------- walk-forward check of EDGE's scale
//
// EDGE claims "+x percentage points of win probability vs a replacement robot". To first order, swapping all
// six robots for replacements gives an even match, so P(red wins) ≈ 0.5 + Σ EDGE(red) − Σ EDGE(blue). That
// linear predictor uses only EDGE values known before each match, so comparing it with outcomes tests whether
// EDGE's units mean what they say. It is a check of scale and calibration, not of the counterfactual itself,
// which is never observed.

export interface EdgeCheckItem {
  /** Information cutoff of the pre-match forecast (seconds). */
  t: number;
  red: { team: string; total: number; sd: number; defense: number; fouls: number; matches: number }[];
  blue: EdgeCheckItem['red'];
  /** Model forecast of the mean alliance score and its margin noise variance (for leakage-free noise fits). */
  level: number;
  noiseVar: number;
  /** 1 red win, 0 blue win, 0.5 tie. */
  y: number;
  xptsRedWinProb: number;
  playoff: boolean;
}

export interface EdgeCheckBin {
  lo: number;
  hi: number;
  n: number;
  /** Mean predicted red-win advantage (Σ EDGE difference) in the bin. */
  predicted: number;
  /** Observed red win rate − 0.5. */
  observed: number;
}

export interface EdgeCheckSplit {
  n: number;
  /** Least-squares slope of observed (win − 0.5) on the summed EDGE difference; 1 means EDGE's scale is right. */
  slope: number;
  brier: { edge: number; xpts: number; coinFlip: number };
  logLoss: { edge: number; xpts: number; coinFlip: number };
  bins: EdgeCheckBin[];
}

export interface EdgeCheck {
  splits: Record<string, EdgeCheckSplit>;
  skippedWarmup: number;
}

const contribNet = (c: EdgeCheckItem['red'][number]): NetEstimate => ({
  team: c.team,
  net: c.total - c.fouls + c.defense,
  sd: c.sd,
  gross: c.total + c.fouls - c.defense,
  matches: c.matches,
});

/** Fit margin noise as var = v·(level/L)^p from earlier forecasts only. */
function fitNoise(hist: { level: number; v: number }[]): Noise | null {
  const pts = hist.filter((h) => h.level > 1 && h.v > 0);
  if (pts.length < 100) return null;
  const xs = pts.map((h) => Math.log(h.level));
  const ys = pts.map((h) => Math.log(h.v));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const p = sxx > 0 ? Math.min(Math.max(sxy / sxx, 0), 3) : 0;
  const L = Math.exp(mx);
  return { totalNoiseSd: 0, marginNoiseSd: Math.sqrt(Math.exp(my)), offset: 0, scaling: { level: L, p: 0, marginP: p } };
}

function summarise(rows: { d: number; y: number; px: number }[]): EdgeCheckSplit {
  const clip = (p: number) => Math.min(Math.max(p, 0.01), 0.99);
  const ll = (p: number, y: number) => -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
  let sdy = 0, sdd = 0;
  const b = { edge: 0, xpts: 0, coinFlip: 0 };
  const l = { edge: 0, xpts: 0, coinFlip: 0 };
  for (const r of rows) {
    sdy += r.d * (r.y - 0.5);
    sdd += r.d * r.d;
    const pe = clip(0.5 + r.d);
    const px = clip(r.px);
    b.edge += (pe - r.y) ** 2;
    b.xpts += (px - r.y) ** 2;
    b.coinFlip += 0.25;
    l.edge += ll(pe, r.y);
    l.xpts += ll(px, r.y);
    l.coinFlip += Math.LN2;
  }
  const n = rows.length || 1;
  const edges = [-Infinity, -0.6, -0.4, -0.25, -0.15, -0.05, 0.05, 0.15, 0.25, 0.4, 0.6, Infinity];
  const bins: EdgeCheckBin[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const inBin = rows.filter((r) => r.d >= edges[i] && r.d < edges[i + 1]);
    if (!inBin.length) continue;
    bins.push({
      lo: edges[i],
      hi: edges[i + 1],
      n: inBin.length,
      predicted: inBin.reduce((a, r) => a + r.d, 0) / inBin.length,
      observed: inBin.reduce((a, r) => a + r.y, 0) / inBin.length - 0.5,
    });
  }
  const div = (o: typeof b) => ({ edge: o.edge / n, xpts: o.xpts / n, coinFlip: o.coinFlip / n });
  return { n: rows.length, slope: sdd > 0 ? sdy / sdd : NaN, brier: div(b), logLoss: div(l), bins };
}

export function checkEdgeScale(items: EdgeCheckItem[], samples = 512, rebuildEvery = 250): EdgeCheck {
  const sorted = [...items].sort((a, b) => a.t - b.t);
  const latest = new Map<string, NetEstimate>();
  const noiseHist: { level: number; v: number }[] = [];
  let ctx: EdgeContext | null = null;
  let base = 0;
  let sinceBuild = Infinity;
  let skipped = 0;
  const rows: { d: number; y: number; px: number; playoff: boolean; thin: boolean }[] = [];
  for (const it of sorted) {
    if (sinceBuild >= rebuildEvery) {
      const noise = fitNoise(noiseHist);
      ctx = noise ? edgeContext([...latest.values()], noise, samples) : null;
      if (ctx) base = winProbWith(ctx, ctx.replacement, ctx.replacementGross);
      sinceBuild = 0;
    }
    const reds = it.red.map(contribNet);
    const blues = it.blue.map(contribNet);
    for (const n of [...reds, ...blues]) latest.set(n.team, n);
    if (ctx) {
      const e = (n: NetEstimate) => winProbWith(ctx!, n.net, n.gross) - base;
      const d = reds.reduce((a, n) => a + e(n), 0) - blues.reduce((a, n) => a + e(n), 0);
      rows.push({ d, y: it.y, px: it.xptsRedWinProb, playoff: it.playoff, thin: [...reds, ...blues].some((n) => n.matches < MIN_RELIABLE_MATCHES) });
    } else skipped++;
    noiseHist.push({ level: it.level, v: it.noiseVar });
    sinceBuild++;
  }
  return {
    splits: {
      all: summarise(rows),
      qual: summarise(rows.filter((r) => !r.playoff)),
      playoff: summarise(rows.filter((r) => r.playoff)),
      established: summarise(rows.filter((r) => !r.thin)),
      thin: summarise(rows.filter((r) => r.thin)),
    },
    skippedWarmup: skipped,
  };
}
