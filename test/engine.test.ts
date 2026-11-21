import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GaussianState } from '../src/engine/gaussian-state.ts';
import { inferRules } from '../src/engine/rules.ts';
import { seasonSpec } from '../src/engine/seasons.ts';
import { normalCdf, normalQuantile, solveSpd, wilson } from '../src/engine/stats.ts';
import { timeline, walkForward, type Forecast, type Predictor } from '../src/engine/predictor.ts';
import { runSeason } from '../src/engine/season.ts';
import type { MatchRow } from '../src/engine/types.ts';
import { syntheticSeason, trueNet } from './synthetic.ts';

const close = (a: number, b: number, tol: number, msg?: string) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b}, got ${a}`);

describe('stats', () => {
  it('normal CDF and quantile are inverse and accurate', () => {
    close(normalCdf(0), 0.5, 1e-7);
    close(normalCdf(1.959964), 0.975, 1e-6);
    for (const p of [0.001, 0.1, 0.5, 0.8, 0.999]) close(normalCdf(normalQuantile(p)), p, 1e-6);
  });
  it('solves SPD systems', () => {
    const x = solveSpd(new Float64Array([4, 1, 1, 3]), new Float64Array([1, 2]), 2)!;
    close(x[0], 1 / 11, 1e-12);
    close(x[1], 7 / 11, 1e-12);
  });
  it('wilson interval brackets the proportion', () => {
    const [lo, hi] = wilson(7, 10);
    assert.ok(lo < 0.7 && hi > 0.7 && lo > 0.3 && hi < 0.95);
  });
});

describe('GaussianState', () => {
  it('sequential updates equal the batch Bayesian ridge posterior', () => {
    // 4 teams, prior N(10, 25) each, alliance observations of 2 teams, noise 4.
    const obs: [number[], number][] = [
      [[0, 1], 25],
      [[2, 3], 18],
      [[0, 2], 22],
      [[1, 3], 21],
      [[0, 3], 19],
    ];
    const s = new GaussianState(2); // also exercises growth
    for (let i = 0; i < 4; i++) s.add(`t${i}`, 10, 25);
    for (const [idx, y] of obs) s.update({ idx, coef: idx.map(() => 1) }, y, 4);
    // Batch: (X'X/σ² + I/τ²) θ = X'y/σ² + μ/τ²
    const A = new Float64Array(16);
    const b = new Float64Array(4);
    for (let i = 0; i < 4; i++) {
      A[i * 4 + i] = 1 / 25;
      b[i] = 10 / 25;
    }
    for (const [idx, y] of obs)
      for (const i of idx) {
        b[i] += y / 4;
        for (const j of idx) A[i * 4 + j] += 1 / 4;
      }
    const theta = solveSpd(A, b, 4)!;
    for (let i = 0; i < 4; i++) close(s.mean(i), theta[i], 1e-9, `θ${i}`);
  });
  it('refuses to reset an observed entry', () => {
    const s = new GaussianState();
    s.add('a', 0, 1);
    s.update({ idx: [0], coef: [1] }, 1, 1);
    assert.throws(() => s.resetPrior(0, 0, 1));
  });
});

describe('rules inference', () => {
  it('recovers per-robot category point values and RP values exactly', () => {
    const { data } = syntheticSeason(3, 120, 4);
    const rules = inferRules(data.matches, seasonSpec(2025));
    const barge = rules.categories.barge.values;
    assert.deepEqual([barge.DeepCage, barge.ShallowCage, barge.Parked, barge.None], [12, 6, 2, 0]);
    assert.equal(rules.categories.auto_leave.values.Yes, 3);
    assert.equal(rules.categories.auto_leave.values.No, 0);
    close(rules.categories.barge.rmse, 0, 1e-6);
    assert.equal(rules.rp.win, 3);
    assert.equal(rules.rp.tie, 1);
  });
});

describe('walk-forward integrity', () => {
  it('never reveals a result before it was public, nor a match to its own forecast', () => {
    const { data } = syntheticSeason(5, 60, 2, 30, 8);
    // Make some results post late: after the next match has already started.
    data.matches.forEach((m, i) => {
      if (i % 3 === 0) m.postResultTime = m.time! + 1000;
    });
    const startOf = (k: string) => data.events.find((e) => e.key === k)!.startDate;
    const { start, avail } = timeline(data.matches, startOf);
    const seen = new Set<string>();
    const violations: string[] = [];
    const spy: Predictor = {
      id: 'spy',
      label: 'spy',
      predict(m: MatchRow): Forecast {
        if (seen.has(m.key)) violations.push(`${m.key} saw itself`);
        for (const k of seen) if (avail.get(k)! > start.get(m.key)!) violations.push(`${m.key} saw ${k}`);
        return { redMean: 0, blueMean: 0, redWinProb: 0.5 };
      },
      observe(m: MatchRow) {
        seen.add(m.key);
      },
    };
    walkForward(data.matches, [spy], startOf);
    assert.deepEqual(violations, []);
    assert.equal(seen.size, data.matches.length);
  });
});

describe('data hygiene', () => {
  it('drops matches without two real alliances so no forecast can become NaN', () => {
    const { data } = syntheticSeason(9, 60, 2, 30, 6);
    const broken = { ...data.matches[40], key: `${data.matches[40].eventKey}_sf1m1`, compLevel: 'sf' as const, blue: [] };
    data.matches.push(broken);
    const run = runSeason(data, {}, false);
    for (const v of run.validation) assert.ok(Number.isFinite(v.metrics.logLoss), `${v.model} ${v.split}`);
    assert.ok(!run.forecasts.some((f) => f.matchKey === broken.key));
  });
});

describe('xPts model on a synthetic season', () => {
  const { data, teams } = syntheticSeason(11);
  const run = runSeason(data);
  const main = run.validation.filter((v) => v.split === 'all');
  const get = (id: string) => main.find((v) => v.model === id)!.metrics;

  it('recovers true robot strength', () => {
    const ratings = new Map(run.model.ratings().map((r) => [r.team, r]));
    const xs: number[] = [];
    const ys: number[] = [];
    for (const t of teams) {
      const r = ratings.get(t.key);
      if (!r || r.matches < 10) continue;
      xs.push(r.net);
      ys.push(trueNet(t, 5));
    }
    const corr = pearson(xs, ys);
    assert.ok(corr > 0.85, `correlation ${corr.toFixed(3)}`);
  });

  it('beats every baseline on log loss and Brier, on the same matches', () => {
    const m = get('xpts');
    for (const b of ['season_avg', 'team_avg', 'event_opr']) {
      assert.ok(m.logLoss < get(b).logLoss, `log loss vs ${b}: ${m.logLoss} ≥ ${get(b).logLoss}`);
      assert.ok(m.brier < get(b).brier, `brier vs ${b}`);
    }
    assert.ok(new Set(main.map((v) => v.metrics.n)).size === 1, 'all models evaluated on identical match sets');
  });

  it('has calibrated predictive intervals and win probabilities', () => {
    const m = get('xpts');
    assert.ok(m.coverage!.p80 > 0.74 && m.coverage!.p80 < 0.86, `80% coverage ${m.coverage!.p80}`);
    for (const b of m.calibration) if (b.n > 150) assert.ok(Math.abs(b.meanPred - b.observed) < 0.08, `bin ${b.lo}: ${b.meanPred} vs ${b.observed}`);
  });

  it('forecasts each bonus RP better than its (in-sample) base rate', () => {
    const byKey = new Map(data.matches.map((m) => [m.key, m]));
    for (const key of ['autoBonusAchieved', 'coralBonusAchieved', 'bargeBonusAchieved']) {
      const ps: number[] = [];
      const ys: number[] = [];
      for (const f of run.forecasts) {
        if (!f.forecast.eligible || !f.forecast.red.rp) continue;
        ps.push(f.forecast.red.rp.bonuses[key]);
        ys.push(byKey.get(f.matchKey)!.breakdown!.red[key] ? 1 : 0);
      }
      const base = ys.reduce((a, b) => a + b, 0) / ys.length;
      const brier = ps.reduce((a, p, i) => a + (p - ys[i]) ** 2, 0) / ps.length;
      const baseBrier = ys.reduce((a, y) => a + (base - y) ** 2, 0) / ys.length;
      assert.ok(brier < baseBrier, `${key}: ${brier.toFixed(4)} vs base ${baseBrier.toFixed(4)}`);
    }
  });

  it('is deterministic', () => {
    const again = runSeason(syntheticSeason(11).data, {}, false);
    assert.equal(again.forecasts.length, run.forecasts.length);
    close(again.forecasts[500].forecast.redWinProb, run.forecasts[500].forecast.redWinProb, 0);
  });
});

function pearson(x: number[], y: number[]) {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}
