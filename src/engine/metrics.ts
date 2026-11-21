// Forecast evaluation metrics.

import type { Forecast } from './predictor.ts';
import { normalCdf, normalQuantile } from './stats.ts';
import type { MatchRow } from './types.ts';

export interface CalibrationBin {
  lo: number;
  hi: number;
  n: number;
  meanPred: number;
  observed: number;
}

export interface Metrics {
  n: number;
  /** Alliance score error. */
  scoreMae: number;
  scoreRmse: number;
  /** Red − blue margin error. */
  marginMae: number;
  /** Win probability, ties scored as 0.5. */
  brier: number;
  logLoss: number;
  /** Share of decided matches where the favourite won. */
  accuracy: number;
  calibration: CalibrationBin[];
  /** Share of alliance scores inside the central 50% / 80% / 95% predictive intervals (null without SDs). */
  coverage: { p50: number; p80: number; p95: number } | null;
  /** Mean continuous ranked probability score of the alliance score distribution (lower is better). */
  crps: number | null;
}

const outcome = (m: MatchRow) => (m.winner === 'red' ? 1 : m.winner === 'blue' ? 0 : 0.5);

/** CRPS of N(mu, sd) against y (closed form). */
function crpsNormal(mu: number, sd: number, y: number) {
  const z = (y - mu) / sd;
  const pdf = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  return sd * (z * (2 * normalCdf(z) - 1) + 2 * pdf - 1 / Math.sqrt(Math.PI));
}

export function evaluate(pairs: { m: MatchRow; f: Forecast }[], bins = 10): Metrics {
  let ae = 0, se = 0, me = 0, brier = 0, ll = 0, correct = 0, decided = 0;
  let covN = 0, c50 = 0, c80 = 0, c95 = 0, crps = 0;
  const z50 = normalQuantile(0.75), z80 = normalQuantile(0.9), z95 = normalQuantile(0.975);
  const cal = Array.from({ length: bins }, (_, i) => ({ lo: i / bins, hi: (i + 1) / bins, n: 0, sp: 0, so: 0 }));
  for (const { m, f } of pairs) {
    const y = outcome(m);
    for (const [pred, act] of [
      [f.redMean, m.redScore!],
      [f.blueMean, m.blueScore!],
    ]) {
      ae += Math.abs(pred - act);
      se += (pred - act) ** 2;
    }
    me += Math.abs(f.redMean - f.blueMean - (m.redScore! - m.blueScore!));
    const p = Math.min(Math.max(f.redWinProb, 1e-4), 1 - 1e-4);
    brier += (p - y) ** 2;
    ll += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
    if (y !== 0.5 && p !== 0.5) {
      decided++;
      if ((p > 0.5) === (y === 1)) correct++;
    }
    const b = cal[Math.min(bins - 1, Math.floor(p * bins))];
    b.n++;
    b.sp += p;
    b.so += y;
    if (f.redSd !== undefined && f.blueSd !== undefined) {
      for (const [mu, sd, act] of [
        [f.redMean, f.redSd, m.redScore!],
        [f.blueMean, f.blueSd, m.blueScore!],
      ]) {
        covN++;
        const z = Math.abs(act - mu) / sd;
        if (z <= z50) c50++;
        if (z <= z80) c80++;
        if (z <= z95) c95++;
        crps += crpsNormal(mu, sd, act);
      }
    }
  }
  const n = pairs.length;
  return {
    n,
    scoreMae: ae / (2 * n),
    scoreRmse: Math.sqrt(se / (2 * n)),
    marginMae: me / n,
    brier: brier / n,
    logLoss: ll / n,
    accuracy: decided ? correct / decided : NaN,
    calibration: cal.map((b) => ({ lo: b.lo, hi: b.hi, n: b.n, meanPred: b.n ? b.sp / b.n : NaN, observed: b.n ? b.so / b.n : NaN })),
    coverage: covN ? { p50: c50 / covN, p80: c80 / covN, p95: c95 / covN } : null,
    crps: covN ? crps / covN : null,
  };
}
