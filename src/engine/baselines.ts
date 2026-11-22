// Transparent baselines. Each sees exactly the same chronologically revealed results as the main model.

import type { Forecast, Predictor } from './predictor.ts';
import { normalCdf } from './stats.ts';
import type { MatchRow } from './types.ts';

/** Running mean and RMS of forecast errors, used to turn point forecasts into probabilities. */
class ErrorScale {
  n = 0;
  ss = 0;
  rms(fallback: number) {
    return this.n < 30 ? fallback : Math.sqrt(this.ss / this.n);
  }
  add(e: number) {
    this.n++;
    this.ss += e * e;
  }
}

/** Every alliance is predicted to score the season-to-date average; win probability is always 50%. */
export class SeasonAverage implements Predictor {
  readonly id = 'season_avg';
  readonly label = 'Season average score';
  private n = 0;
  private s = 0;
  predict(): Forecast | null {
    if (this.n === 0) return null;
    const mu = this.s / this.n;
    return { redMean: mu, blueMean: mu, redWinProb: 0.5 };
  }
  observe(m: MatchRow) {
    this.n += 2;
    this.s += m.redScore! + m.blueScore!;
  }
}

/**
 * Each team's average alliance score so far this season; an alliance is predicted as the mean of its three
 * teams' averages (teams without data use the season average). Probabilities come from a normal margin whose
 * spread is the baseline's own historical margin RMSE.
 */
export class TeamAverage implements Predictor {
  readonly id = 'team_avg';
  readonly label = 'Team average alliance score';
  private sum = new Map<string, number>();
  private cnt = new Map<string, number>();
  private n = 0;
  private s = 0;
  private marginErr = new ErrorScale();
  private last = new Map<string, number>();

  private alliance(teams: string[], mu: number) {
    let t = 0;
    for (const k of teams) {
      const c = this.cnt.get(k);
      t += c ? this.sum.get(k)! / c : mu;
    }
    return teams.length ? t / teams.length : mu;
  }

  predict(m: MatchRow): Forecast | null {
    if (this.n === 0) return null;
    const mu = this.s / this.n;
    const r = this.alliance(m.red, mu);
    const b = this.alliance(m.blue, mu);
    this.last.set(m.key, r - b);
    const sd = this.marginErr.rms(mu * 0.5 + 1);
    return { redMean: r, blueMean: b, redWinProb: normalCdf((r - b) / sd) };
  }

  observe(m: MatchRow) {
    const pm = this.last.get(m.key);
    if (pm !== undefined) {
      this.marginErr.add(m.redScore! - m.blueScore! - pm);
      this.last.delete(m.key);
    }
    for (const [teams, score] of [
      [m.red, m.redScore!],
      [m.blue, m.blueScore!],
    ] as const)
      for (const t of teams) {
        this.sum.set(t, (this.sum.get(t) ?? 0) + score);
        this.cnt.set(t, (this.cnt.get(t) ?? 0) + 1);
      }
    this.n += 2;
    this.s += m.redScore! + m.blueScore!;
  }
}

/**
 * Elo / EPA baseline (exponentially updated per-team rating on point scale).
 * Predicts alliance score as sum of 3 teams' EPAs; updates each team by (actual - expected) * K / 3.
 * Win probability is derived from predicted margin and historical margin RMSE.
 */
export class EloEpa implements Predictor {
  readonly id = 'elo_epa';
  readonly label = 'Elo / EPA rating';
  private epa = new Map<string, number>();
  private matchCount = new Map<string, number>();
  private n = 0;
  private s = 0;
  private marginErr = new ErrorScale();
  private last = new Map<string, number>();
  private readonly defaultK: number;

  constructor(k = 0.12) {
    this.defaultK = k;
  }

  private teamEpa(team: string, mu: number): number {
    const e = this.epa.get(team);
    return e !== undefined ? e : mu / 3;
  }

  predict(m: MatchRow): Forecast | null {
    if (this.n === 0) return null;
    const mu = this.s / this.n;
    let r = 0;
    for (const t of m.red) r += this.teamEpa(t, mu);
    let b = 0;
    for (const t of m.blue) b += this.teamEpa(t, mu);
    this.last.set(m.key, r - b);
    const sd = this.marginErr.rms(mu * 0.5 + 1);
    return { redMean: r, blueMean: b, redWinProb: normalCdf((r - b) / sd) };
  }

  observe(m: MatchRow) {
    const pm = this.last.get(m.key);
    if (pm !== undefined) {
      this.marginErr.add(m.redScore! - m.blueScore! - pm);
      this.last.delete(m.key);
    }
    const mu = this.s / Math.max(this.n, 1);
    // Update red teams
    let rPred = 0;
    for (const t of m.red) rPred += this.teamEpa(t, mu);
    const rErr = m.redScore! - rPred;
    for (const t of m.red) {
      const c = this.matchCount.get(t) ?? 0;
      const k = this.defaultK * Math.max(0.5, 1.5 / (1 + 0.1 * c));
      const cur = this.teamEpa(t, mu);
      this.epa.set(t, cur + (k / Math.max(m.red.length, 1)) * rErr);
      this.matchCount.set(t, c + 1);
    }
    // Update blue teams
    let bPred = 0;
    for (const t of m.blue) bPred += this.teamEpa(t, mu);
    const bErr = m.blueScore! - bPred;
    for (const t of m.blue) {
      const c = this.matchCount.get(t) ?? 0;
      const k = this.defaultK * Math.max(0.5, 1.5 / (1 + 0.1 * c));
      const cur = this.teamEpa(t, mu);
      this.epa.set(t, cur + (k / Math.max(m.blue.length, 1)) * bErr);
      this.matchCount.set(t, c + 1);
    }
    this.n += 2;
    this.s += m.redScore! + m.blueScore!;
  }
}
