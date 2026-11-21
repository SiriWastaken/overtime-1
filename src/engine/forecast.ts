// On-demand forecasts from stored per-team marginal estimates (playoffs, alliance selection, the public
// /predict endpoint). The walk-forward forecasts use the full event covariance; here partner covariances are
// not stored, so parameter variances are summed as if independent. Parameter variance is small next to match
// noise once teams have played, so the effect on probabilities is minor; it is documented as a limitation.

import type { SeasonSpec } from './seasons.ts';
import { normalCdf, Z80 } from './stats.ts';

export interface TeamState {
  team: string;
  /** Component id → estimate; defensive effects are stored under "<component>#def". */
  comps: Record<string, { mean: number; sd: number }>;
}

export interface Noise {
  totalNoiseSd: number;
  marginNoiseSd: number;
  offset: number;
  /** Noise grows with scoring level: variance × (μ/level)^p. Absent → constant noise. */
  scaling?: { level: number; p: number; marginP: number };
}

const scale = (noise: Noise, mu: number, p: number) => (noise.scaling && noise.scaling.level > 0 ? Math.pow(Math.max(mu, noise.scaling.level / 4) / noise.scaling.level, p) : 1);

export interface QuickSide {
  mean: number;
  sd: number;
  lo80: number;
  hi80: number;
  components: Record<string, number>;
}

export interface QuickForecast {
  red: QuickSide;
  blue: QuickSide;
  margin: number;
  marginSd: number;
  redWinProb: number;
}

function side(spec: SeasonSpec, own: TeamState[], opp: TeamState[]) {
  const components: Record<string, number> = {};
  let mean = 0;
  let pv = 0;
  for (const c of spec.components) {
    let m = 0;
    for (const t of c.attribution === 'opponent' ? opp : own) {
      const e = t.comps[c.id];
      if (!e) continue;
      m += e.mean;
      pv += e.sd * e.sd;
    }
    for (const t of opp) {
      const d = t.comps[`${c.id}#def`];
      if (!d) continue;
      m -= d.mean;
      pv += d.sd * d.sd;
    }
    components[c.id] = m;
    mean += m;
  }
  return { mean, pv, components };
}

export function quickForecast(spec: SeasonSpec, noise: Noise, red: TeamState[], blue: TeamState[]): QuickForecast {
  const r = side(spec, red, blue);
  const b = side(spec, blue, red);
  const rm = r.mean + noise.offset;
  const bm = b.mean + noise.offset;
  const p = noise.scaling?.p ?? 0;
  const rsd = Math.sqrt(r.pv + noise.totalNoiseSd ** 2 * scale(noise, rm, p));
  const bsd = Math.sqrt(b.pv + noise.totalNoiseSd ** 2 * scale(noise, bm, p));
  const margin = rm - bm;
  const marginSd = Math.sqrt(r.pv + b.pv + noise.marginNoiseSd ** 2 * scale(noise, (rm + bm) / 2, noise.scaling?.marginP ?? 0));
  const mk = (mean: number, sd: number, components: Record<string, number>): QuickSide => ({ mean, sd, lo80: mean - Z80 * sd, hi80: mean + Z80 * sd, components });
  return { red: mk(rm, rsd, r.components), blue: mk(bm, bsd, b.components), margin, marginSd, redWinProb: normalCdf(margin / marginSd) };
}

/** Net expected contribution used to order teams (e.g. which three robots of a four-robot alliance play). */
export function netValue(spec: SeasonSpec, t: TeamState): number {
  let v = 0;
  for (const c of spec.components) {
    const e = t.comps[c.id];
    if (!e) continue;
    v += c.attribution === 'opponent' ? -e.mean : e.mean;
    const d = t.comps[`${c.id}#def`];
    if (d) v += d.mean;
  }
  return v;
}
