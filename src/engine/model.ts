// xPts: season-isolated Bayesian contribution model.
//
// For each scoring component c and each event e, every team i has a latent contribution θ[i,c] (points per match).
//   alliance components:  y(alliance) = Σ_{i∈alliance} θ[i,c] − Σ_{j∈opponents} δ[j,c] + ε      (δ only if defense on)
//   robot components:     y(robot)    = θ[i,c] + ε                                                  (observed per robot)
//   opponent components:  y(alliance) = Σ_{j∈opponents} θ[j,c] + ε                                (fouls conceded)
// Within an event the posterior is exact (GaussianState, full covariance). Between events a team carries its
// marginal posterior forward, shifted by the change in the season-wide per-robot level and widened by process
// noise. Season hyperparameters (level μ, team spread τ², noise σ²) are estimated online from results already
// public at the time, so the model starts every season from zero knowledge and never sees prior seasons.

import { GaussianState, type Sparse } from './gaussian-state.ts';
import { OnlineLogit } from './logit.ts';
import type { Forecast, Predictor } from './predictor.ts';
import { inferRules, type RuleFits } from './rules.ts';
import type { ComponentSpec, SeasonSpec } from './seasons.ts';
import { seasonSpec } from './seasons.ts';
import { normalCdf, solveSpd, Z80 } from './stats.ts';
import type { Color, MatchRow, SeasonData } from './types.ts';

export const MODEL_VERSION = 'xpts-1.2.0';

export interface ModelOptions {
  /** Between-event random-walk variance, as a fraction of the season's team spread τ². */
  eta: number;
  /** Per-match random-walk variance, as a fraction of τ². */
  q: number;
  /** Carry team estimates from event to event (false = every event starts from the season prior). */
  carry: boolean;
  /** Shift carried estimates by the change in the season-wide per-robot level since they were formed. */
  drift: boolean;
  /** Estimate per-team defensive suppression of defendable components. */
  defense: boolean;
  /** Prior variance of defensive effects, as a fraction of τ². */
  defenseFrac: number;
  /** Observations of every component needed before forecasts are considered informed. */
  minObs: number;
  /** Half-life (in observations) of the online season hyperparameter estimates. */
  halfLife: number;
}

export const DEFAULT_OPTIONS: ModelOptions = {
  eta: 0.15,
  q: 0.01,
  carry: true,
  drift: true,
  // On since 1.1.0: improved log loss and Brier in 2025 (chosen) and again in 2026 (confirmed).
  defense: true,
  defenseFrac: 0.1,
  minObs: 60,
  halfLife: 1500,
};

/**
 * Recursive estimate of a noise variance σ² from forecast innovations r ~ N(0, p + σ²), where p = h'Ph is the
 * parameter part. The maximum-likelihood score equation Σ (r² − p − σ²)/(p + σ²)² = 0 is solved as a
 * weighted mean with weights 1/(p + σ̂²)², exponentially discounted so the estimate can follow the season.
 * (A plain mean of r² − p is badly biased early in a season, when diffuse priors make p enormous.)
 */
export class NoiseEstimator {
  private A = 0;
  private B = 0;
  n = 0;
  private readonly decay: number;
  constructor(halfLife: number) {
    this.decay = Math.pow(2, -1 / halfLife);
  }
  add(r: number, p: number, current: number) {
    const w = 1 / (p + current) ** 2;
    this.A = this.decay * this.A + w * (r * r - p);
    this.B = this.decay * this.B + w;
    this.n++;
  }
  /** Floored at a fraction of the fallback: σ² cannot be negative even when an estimate overshoots. */
  value(fallback: number, minN = 30) {
    return this.n < minN || this.B === 0 ? fallback : Math.max(this.A / this.B, 0.02 * fallback, 0.25);
  }
}

/**
 * Prior-free estimate of a component's noise variance σ²: within each event, fit unregularised least squares
 * (OPR-style) to the observations so far and pool the residual sums of squares with a degrees-of-freedom
 * correction, σ² = Σ RSS / Σ (N − p). Unlike innovation-based estimates this cannot absorb team-to-team
 * variance when the prior spread is wrong, so τ² (derived from it) cannot collapse.
 */
class PooledOls {
  private readonly events = new Map<string, { rows: { cols: number[]; y: number }[]; cols: Map<string, number>; rss: number; dof: number; fitAt: number }>();
  rss = 0;
  dof = 0;
  add(eventKey: string, teams: string[], y: number) {
    let e = this.events.get(eventKey);
    if (!e) this.events.set(eventKey, (e = { rows: [], cols: new Map(), rss: 0, dof: 0, fitAt: 0 }));
    const cols = teams.map((t) => {
      let i = e!.cols.get(t);
      if (i === undefined) e!.cols.set(t, (i = e!.cols.size));
      return i;
    });
    e.rows.push({ cols, y });
    const p = e.cols.size;
    const N = e.rows.length;
    if (N >= 1.5 * p && N - e.fitAt >= 10) this.refit(e, p);
  }
  private refit(e: { rows: { cols: number[]; y: number }[]; rss: number; dof: number; fitAt: number }, p: number) {
    const A = new Float64Array(p * p);
    const b = new Float64Array(p);
    for (const r of e.rows)
      for (const i of r.cols) {
        b[i] += r.y;
        for (const j of r.cols) A[i * p + j] += 1;
      }
    for (let i = 0; i < p; i++) A[i * p + i] += 1e-6;
    const beta = solveSpd(A, b, p);
    if (!beta) return;
    let rss = 0;
    for (const r of e.rows) {
      let yh = 0;
      for (const i of r.cols) yh += beta[i];
      rss += (r.y - yh) ** 2;
    }
    this.rss += rss - e.rss;
    this.dof += e.rows.length - p - e.dof;
    e.rss = rss;
    e.dof = e.rows.length - p;
    e.fitAt = e.rows.length;
  }
  get sigma2(): number | null {
    return this.dof >= 30 ? this.rss / this.dof : null;
  }
}

/** Online estimates of one component's season-level parameters. */
class Hyper {
  n = 0;
  mu = 0; // per-robot level
  V = 0; // variance of an observation about k·μ
  readonly k: number;
  private readonly halfLife: number;
  readonly ols = new PooledOls();
  constructor(k: number, halfLife: number) {
    this.k = k;
    this.halfLife = halfLife;
  }
  observe(y: number, eventKey: string, teams: string[]) {
    this.n++;
    const a = Math.max(1 / this.n, Math.LN2 / this.halfLife);
    const d = y - this.k * this.mu;
    this.V += a * (d * d - this.V);
    this.mu += (a * d) / this.k;
    this.ols.add(eventKey, teams, y);
  }
  get ready() {
    return this.ols.sigma2 !== null;
  }
  get sigma2() {
    return Math.max(this.ols.sigma2 ?? this.V / 2, 0.01 * this.V, 0.05);
  }
  get tau2() {
    return Math.max((this.V - this.sigma2) / this.k, (0.02 * this.V) / this.k, 0.05);
  }
}

/**
 * Aggregate residual variance (alliance total or margin) that grows with the scoring level:
 *   Var(r) = paramVar + v · g(μ),  g(μ) = (max(μ, μ̄/4) / μ̄)^p.
 * p is the slope of an exponentially discounted regression of log r² on log μ (higher-scoring alliances are
 * measurably noisier); v is the ML-weighted noise on residuals rescaled by g. All from past forecasts only.
 */
class ScaledResidual {
  private readonly est: NoiseEstimator;
  private readonly decay: number;
  private sx = 0;
  private sy = 0;
  private sxx = 0;
  private sxy = 0;
  private w = 0;
  private level = 0;
  private nLevel = 0;
  private fallback = 1;
  constructor(halfLife: number) {
    this.est = new NoiseEstimator(halfLife);
    this.decay = Math.pow(2, -1 / halfLife);
  }
  get n() {
    return this.est.n;
  }
  get p() {
    if (this.w < 200) return 0;
    const den = this.w * this.sxx - this.sx * this.sx;
    return den > 0 ? Math.min(Math.max((this.w * this.sxy - this.sx * this.sy) / den, 0), 2) : 0;
  }
  g(mu: number) {
    if (this.nLevel === 0 || this.level <= 0) return 1;
    return Math.pow(Math.max(mu, this.level / 4) / this.level, this.p);
  }
  /** r: residual; paramVar: its parameter part; mu: scoring level of the forecast. */
  add(r: number, paramVar: number, mu: number) {
    const g = this.g(mu);
    this.est.add(r / Math.sqrt(g), paramVar / g, this.est.value(this.fallback / g));
    this.nLevel++;
    this.level += Math.max(1 / this.nLevel, 1 - this.decay) * (mu - this.level);
    if (mu > 1) {
      const x = Math.log(mu);
      const y = Math.log(Math.max(r * r - paramVar, 0) + 1);
      this.sx = this.decay * this.sx + x;
      this.sy = this.decay * this.sy + y;
      this.sxx = this.decay * this.sxx + x * x;
      this.sxy = this.decay * this.sxy + x * y;
      this.w = this.decay * this.w + 1;
    }
  }
  get levelNow() {
    return this.level;
  }
  value(fallback: number, mu: number) {
    this.fallback = fallback;
    return this.est.value(fallback) * this.g(mu);
  }
}

export interface TeamContribution {
  team: string;
  /** Expected non-foul points contributed per match. */
  total: number;
  sd: number;
  components: Record<string, number>;
  /** Expected points suppressed from opponents per match (defense option only). */
  defense: number;
  /** Expected foul points conceded to opponents per match. */
  fouls: number;
  matches: number;
}

export interface SideForecast {
  mean: number;
  sd: number;
  lo80: number;
  hi80: number;
  paramVar: number;
  components: Record<string, number>;
  teams: TeamContribution[];
  rp: { win: number; bonuses: Record<string, number>; expected: number } | null;
}

export interface XptsForecast extends Forecast {
  red: SideForecast;
  blue: SideForecast;
  margin: number;
  marginSd: number;
  /** Part of the margin variance due to parameter uncertainty (the rest is match noise). */
  marginParamVar: number;
  tieProb: number;
  /** True once every component has enough season data for the forecast to be informed. */
  eligible: boolean;
  cutoff: number;
}

export interface ComponentRating {
  mean: number;
  sd: number;
}

export interface TeamRating {
  team: string;
  total: ComponentRating;
  net: number;
  components: Record<string, ComponentRating>;
  defense: ComponentRating | null;
  fouls: ComponentRating;
  matches: number;
  events: string[];
  /** Ratio of observed to expected squared forecast error for this team's alliances (shrunk toward 1). */
  volatility: number;
  /** Observed per-robot outcomes, e.g. { barge: { DeepCage: 7, None: 2 } }. */
  outcomes: Record<string, Record<string, number>>;
  lastEvent: string | null;
}

export interface HistoryPoint {
  team: string;
  matchKey: string;
  eventKey: string;
  t: number;
  mean: number;
  sd: number;
}

interface Carry {
  mean: number;
  var: number;
  mu: number;
}

interface TeamBook {
  matches: number;
  events: string[];
  z2: number;
  zn: number;
  outcomes: Record<string, Record<string, number>>;
}

export class XptsModel implements Predictor<XptsForecast> {
  readonly id: string;
  readonly label: string;
  readonly spec: SeasonSpec;
  readonly rules: RuleFits;
  readonly opts: ModelOptions;
  private readonly hyper = new Map<string, Hyper>();
  private readonly tot: ScaledResidual;
  private readonly marg: ScaledResidual;
  private offset = 0;
  private offsetN = 0;
  private readonly filters = new Map<string, Map<string, GaussianState>>();
  private readonly carried = new Map<string, Set<string>>(); // eventKey → state keys seeded from a carry
  private readonly carry = new Map<string, Map<string, Carry>>(); // team → "comp|param" → carry
  private readonly books = new Map<string, TeamBook>();
  private readonly logits = new Map<string, OnlineLogit>();
  private readonly eventTeams: Map<string, string[]>;
  private readonly last = new Map<string, XptsForecast>();
  readonly history: HistoryPoint[] = [];
  /** Each event's team estimates frozen when its first playoff match was forecast (for leakage-free replays). */
  readonly prePlayoff = new Map<string, ReturnType<XptsModel['eventRatings']>>();
  dataAsOf = 0;
  quality = { alliances: 0, missingBreakdown: 0, componentMismatch: 0 };

  constructor(data: SeasonData, opts: Partial<ModelOptions> = {}, spec?: SeasonSpec, id = 'xpts', label = 'xPts (Overtime 1)') {
    this.id = id;
    this.label = label;
    this.opts = { ...DEFAULT_OPTIONS, ...opts };
    this.spec = spec ?? seasonSpec(data.year);
    this.rules = inferRules(data.matches, this.spec);
    for (const c of this.spec.components) this.hyper.set(c.id, new Hyper(c.attribution === 'robot' ? 1 : 3, this.opts.halfLife));
    this.tot = new ScaledResidual(this.opts.halfLife);
    this.marg = new ScaledResidual(this.opts.halfLife);
    for (const b of this.spec.bonuses) this.logits.set(b.key, new OnlineLogit());
    // Teams per event: registrations plus anyone who appears in a match (schedules are public before play).
    this.eventTeams = new Map();
    for (const [k, v] of data.eventTeams) this.eventTeams.set(k, [...v]);
    for (const m of data.matches) {
      const list = this.eventTeams.get(m.eventKey) ?? [];
      for (const t of [...m.red, ...m.blue]) if (!list.includes(t)) list.push(t);
      this.eventTeams.set(m.eventKey, list);
    }
  }

  // ---------------------------------------------------------------- state

  private prior(team: string, c: ComponentSpec, param: 'off' | 'def'): { mean: number; var: number; carried: boolean } {
    const h = this.hyper.get(c.id)!;
    const informed = h.n >= this.opts.minObs / 4;
    const tau2 = informed ? h.tau2 : 1e4;
    const frac = param === 'def' ? this.opts.defenseFrac : 1;
    const base = param === 'def' ? 0 : h.mu;
    const cr = this.opts.carry ? this.carry.get(team)?.get(`${c.id}|${param}`) : undefined;
    if (cr) {
      const shift = param === 'off' && this.opts.drift ? h.mu - cr.mu : 0;
      return { mean: cr.mean + shift, var: cr.var + this.opts.eta * frac * tau2, carried: true };
    }
    return { mean: base, var: frac * tau2, carried: false };
  }

  private paramsFor(c: ComponentSpec): ('off' | 'def')[] {
    return this.opts.defense && c.defendable && c.attribution === 'alliance' ? ['off', 'def'] : ['off'];
  }

  private eventState(eventKey: string): Map<string, GaussianState> {
    let f = this.filters.get(eventKey);
    if (!f) {
      f = new Map();
      const seeded = new Set<string>();
      const teams = this.eventTeams.get(eventKey) ?? [];
      for (const c of this.spec.components) {
        const s = new GaussianState(Math.max(8, teams.length * 2));
        for (const t of teams)
          for (const p of this.paramsFor(c)) {
            const pr = this.prior(t, c, p);
            s.add(`${t}#${p}`, pr.mean, pr.var);
            if (pr.carried) seeded.add(`${c.id}|${t}#${p}`);
          }
        f.set(c.id, s);
      }
      this.filters.set(eventKey, f);
      this.carried.set(eventKey, seeded);
    }
    // Teams with no data yet track the current season prior (their covariance rows are still empty).
    const seeded = this.carried.get(eventKey)!;
    for (const c of this.spec.components) {
      const s = f.get(c.id)!;
      for (let i = 0; i < s.n; i++) {
        if (s.obs[i] !== 0 || seeded.has(`${c.id}|${s.keys[i]}`)) continue;
        const [t, p] = s.keys[i].split('#') as [string, 'off' | 'def'];
        const pr = this.prior(t, c, p);
        if (pr.carried) {
          seeded.add(`${c.id}|${s.keys[i]}`);
        }
        s.resetPrior(i, pr.mean, pr.var);
      }
    }
    return f;
  }

  private ensure(s: GaussianState, team: string, c: ComponentSpec, p: 'off' | 'def') {
    if (s.has(`${team}#${p}`)) return s.get(`${team}#${p}`);
    const pr = this.prior(team, c, p);
    return s.add(`${team}#${p}`, pr.mean, pr.var);
  }

  /** Linear map from the state to this side's expected points for component c. */
  private design(s: GaussianState, c: ComponentSpec, own: string[], opp: string[]): Sparse {
    const idx: number[] = [];
    const coef: number[] = [];
    const credited = c.attribution === 'opponent' ? opp : own;
    for (const t of credited) {
      idx.push(this.ensure(s, t, c, 'off'));
      coef.push(1);
    }
    if (this.paramsFor(c).includes('def'))
      for (const t of opp) {
        idx.push(this.ensure(s, t, c, 'def'));
        coef.push(-1);
      }
    return { idx, coef };
  }

  private noise(c: ComponentSpec) {
    return this.hyper.get(c.id)!.sigma2;
  }

  // ---------------------------------------------------------------- forecasting

  predict(m: MatchRow, cutoff: number): XptsForecast {
    const f = this.eventState(m.eventKey);
    if (m.compLevel !== 'qm' && !this.prePlayoff.has(m.eventKey)) this.prePlayoff.set(m.eventKey, this.eventRatings(m.eventKey));
    const sides = { red: { own: m.red, opp: m.blue }, blue: { own: m.blue, opp: m.red } };
    const comp: Record<Color, Record<string, number>> = { red: {}, blue: {} };
    let varR = 0;
    let varB = 0;
    let covRB = 0;
    let noiseFallback = 0;
    for (const c of this.spec.components) {
      const s = f.get(c.id)!;
      const hR = this.design(s, c, sides.red.own, sides.red.opp);
      const hB = this.design(s, c, sides.blue.own, sides.blue.opp);
      comp.red[c.id] = s.predictMean(hR);
      comp.blue[c.id] = s.predictMean(hB);
      varR += s.covariance(hR, hR);
      varB += s.covariance(hB, hB);
      covRB += s.covariance(hR, hB);
      noiseFallback += this.noise(c) * (c.attribution === 'robot' ? 3 : 1);
    }
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0) + this.offset;
    const meanR = sum(comp.red);
    const meanB = sum(comp.blue);
    const totNoiseR = this.tot.value(noiseFallback, meanR);
    const totNoiseB = this.tot.value(noiseFallback, meanB);
    const margin = meanR - meanB;
    const level = (meanR + meanB) / 2;
    const marginSd = Math.sqrt(Math.max(varR + varB - 2 * covRB, 0) + this.marg.value(2 * noiseFallback, level));
    const pBlue = normalCdf((-0.5 - margin) / marginSd);
    const pRedOrTie = 1 - pBlue;
    const pRed = 1 - normalCdf((0.5 - margin) / marginSd);
    const tie = Math.max(pRedOrTie - pRed, 0);
    const eligible = [...this.hyper.values()].every((h) => h.n >= this.opts.minObs && h.ready) && this.tot.n >= 30;

    const side = (color: Color, mean: number, pv: number, winP: number): SideForecast => {
      const sd = Math.sqrt(pv + (color === 'red' ? totNoiseR : totNoiseB));
      const own = color === 'red' ? m.red : m.blue;
      const bonuses: Record<string, number> = {};
      let expected = 0;
      const qual = m.compLevel === 'qm' && this.spec.bonuses.length > 0;
      if (qual) {
        for (const b of this.spec.bonuses) {
          const x = b.features.reduce((a, id) => a + (comp[color][id] ?? 0), 0);
          bonuses[b.key] = this.logits.get(b.key)!.predict(x);
          expected += bonuses[b.key];
        }
        expected += this.rules.rp.win * winP + this.rules.rp.tie * tie;
      }
      return {
        mean,
        sd,
        lo80: mean - Z80 * sd,
        hi80: mean + Z80 * sd,
        paramVar: pv,
        components: comp[color],
        teams: own.map((t) => this.contribution(f, t)),
        rp: qual ? { win: winP, bonuses, expected } : null,
      };
    };
    const fc: XptsForecast = {
      redMean: meanR,
      blueMean: meanB,
      redSd: Math.sqrt(varR + totNoiseR),
      blueSd: Math.sqrt(varB + totNoiseB),
      redWinProb: pRed + tie / 2,
      red: side('red', meanR, varR, pRed),
      blue: side('blue', meanB, varB, pBlue),
      margin,
      marginSd,
      marginParamVar: Math.max(varR + varB - 2 * covRB, 0),
      tieProb: tie,
      eligible,
      cutoff,
    };
    this.last.set(m.key, fc);
    return fc;
  }

  private contribution(f: Map<string, GaussianState>, team: string): TeamContribution {
    const components: Record<string, number> = {};
    let total = 0;
    let v = 0;
    let def = 0;
    let fouls = 0;
    for (const c of this.spec.components) {
      const s = f.get(c.id)!;
      const i = this.ensure(s, team, c, 'off');
      if (c.attribution === 'opponent') {
        fouls += s.mean(i);
        continue;
      }
      components[c.id] = s.mean(i);
      total += s.mean(i);
      v += s.variance(i);
      if (this.paramsFor(c).includes('def')) def += s.mean(this.ensure(s, team, c, 'def'));
    }
    return { team, total, sd: Math.sqrt(v), components, defense: def, fouls, matches: this.books.get(team)?.matches ?? 0 };
  }

  // ---------------------------------------------------------------- learning

  observe(m: MatchRow, availableAt: number) {
    if (m.redScore === null || m.blueScore === null) return;
    const f = this.eventState(m.eventKey);
    const fc = this.last.get(m.key);
    this.last.delete(m.key);
    const teams = [...m.red, ...m.blue];

    for (const c of this.spec.components) {
      const s = f.get(c.id)!;
      const tau2 = this.hyper.get(c.id)!.tau2;
      for (const t of teams) for (const p of this.paramsFor(c)) s.inflate(this.ensure(s, t, c, p), this.opts.q * tau2 * (p === 'def' ? this.opts.defenseFrac : 1));
    }

    for (const color of ['red', 'blue'] as const) {
      const own = color === 'red' ? m.red : m.blue;
      const opp = color === 'red' ? m.blue : m.red;
      const score = color === 'red' ? m.redScore : m.blueScore;
      const b = m.breakdown?.[color] ?? null;
      this.quality.alliances++;
      if (!b && !this.spec.generic) this.quality.missingBreakdown++;
      let compSum = 0;
      let complete = true;
      for (const c of this.spec.components) {
        const s = f.get(c.id)!;
        const h = this.hyper.get(c.id)!;
        const y = c.points(b, score);
        if (y === null) {
          complete = false;
          continue;
        }
        compSum += y;
        if (c.attribution === 'robot') {
          const values = this.rules.categories[c.id]?.values;
          own.forEach((t, k) => {
            const cat = b?.[c.robotField!(k + 1)];
            if (typeof cat !== 'string' || !values || values[cat] === undefined) return;
            const book = this.book(t);
            (book.outcomes[c.id] ??= {})[cat] = (book.outcomes[c.id][cat] ?? 0) + 1;
            s.update({ idx: [this.ensure(s, t, c, 'off')], coef: [1] }, values[cat], h.sigma2);
            h.observe(values[cat], m.eventKey, [t]);
          });
        } else {
          s.update(this.design(s, c, own, opp), y, h.sigma2);
          h.observe(y, m.eventKey, c.attribution === 'opponent' ? opp : own);
        }
      }
      if (complete) {
        if (b && Math.abs(score - compSum) > 0.5) this.quality.componentMismatch++;
        this.offsetN++;
        this.offset += Math.max(1 / this.offsetN, Math.LN2 / this.opts.halfLife) * (score - compSum - this.offset);
      }

      if (fc) {
        const sf = fc[color];
        const r = score - sf.mean;
        this.tot.add(r, sf.paramVar, sf.mean);
        const z2 = (r * r) / (sf.sd * sf.sd);
        for (const t of own) {
          const book = this.book(t);
          book.z2 += z2;
          book.zn++;
        }
        if (sf.rp && b) for (const bs of this.spec.bonuses) if (typeof b[bs.key] === 'boolean') this.logits.get(bs.key)!.add(bs.features.reduce((a, id) => a + (sf.components[id] ?? 0), 0), b[bs.key] as boolean);
      }
    }
    if (fc) this.marg.add(m.redScore - m.blueScore - fc.margin, fc.marginParamVar, (fc.redMean + fc.blueMean) / 2);

    for (const t of teams) {
      const book = this.book(t);
      book.matches++;
      if (!book.events.includes(m.eventKey)) book.events.push(m.eventKey);
      for (const c of this.spec.components) {
        const s = f.get(c.id)!;
        for (const p of this.paramsFor(c)) {
          const i = this.ensure(s, t, c, p);
          let cm = this.carry.get(t);
          if (!cm) this.carry.set(t, (cm = new Map()));
          cm.set(`${c.id}|${p}`, { mean: s.mean(i), var: s.variance(i), mu: this.hyper.get(c.id)!.mu });
        }
      }
      const tc = this.contribution(f, t);
      this.history.push({ team: t, matchKey: m.key, eventKey: m.eventKey, t: availableAt, mean: tc.total, sd: tc.sd });
    }
    this.dataAsOf = Math.max(this.dataAsOf, availableAt);
  }

  private book(team: string): TeamBook {
    let b = this.books.get(team);
    if (!b) this.books.set(team, (b = { matches: 0, events: [], z2: 0, zn: 0, outcomes: {} }));
    return b;
  }

  // ---------------------------------------------------------------- outputs

  /** Current season ratings: each team's latest estimate, moved to today's season level. */
  ratings(): TeamRating[] {
    const out: TeamRating[] = [];
    for (const [team, cm] of this.carry) {
      const components: Record<string, ComponentRating> = {};
      let total = 0;
      let v = 0;
      let fouls: ComponentRating = { mean: 0, sd: 0 };
      let defMean = 0;
      let defVar = 0;
      for (const c of this.spec.components) {
        const h = this.hyper.get(c.id)!;
        const cr = cm.get(`${c.id}|off`);
        if (!cr) continue;
        const mean = cr.mean + (this.opts.drift ? h.mu - cr.mu : 0);
        if (c.attribution === 'opponent') {
          fouls = { mean, sd: Math.sqrt(cr.var) };
          continue;
        }
        components[c.id] = { mean, sd: Math.sqrt(cr.var) };
        total += mean;
        v += cr.var;
        const d = cm.get(`${c.id}|def`);
        if (d) {
          defMean += d.mean;
          defVar += d.var;
          components[`${c.id}#def`] = { mean: d.mean, sd: Math.sqrt(d.var) };
        }
      }
      const book = this.book(team);
      const k0 = 6;
      const defense = this.opts.defense ? { mean: defMean, sd: Math.sqrt(defVar) } : null;
      out.push({
        team,
        total: { mean: total, sd: Math.sqrt(v) },
        net: total - fouls.mean + (defense?.mean ?? 0),
        components,
        defense,
        fouls,
        matches: book.matches,
        events: book.events,
        volatility: (book.z2 + k0) / (book.zn + k0),
        outcomes: book.outcomes,
        lastEvent: book.events.at(-1) ?? null,
      });
    }
    return out.sort((a, b) => b.net - a.net);
  }

  /** Each team's marginal estimate at a given event (as of the latest data). */
  eventRatings(eventKey: string): Map<string, TeamContribution & { comps: Record<string, ComponentRating> }> {
    const out = new Map<string, TeamContribution & { comps: Record<string, ComponentRating> }>();
    const f = this.filters.get(eventKey);
    if (!f) return out;
    for (const team of this.eventTeams.get(eventKey) ?? []) {
      const comps: Record<string, ComponentRating> = {};
      for (const c of this.spec.components) {
        const s = f.get(c.id)!;
        const i = this.ensure(s, team, c, 'off');
        comps[c.id] = { mean: s.mean(i), sd: Math.sqrt(s.variance(i)) };
        if (this.paramsFor(c).includes('def')) {
          const j = this.ensure(s, team, c, 'def');
          comps[`${c.id}#def`] = { mean: s.mean(j), sd: Math.sqrt(s.variance(j)) };
        }
      }
      out.set(team, { ...this.contribution(f, team), comps });
    }
    return out;
  }

  /** Make sure an event's state exists (e.g. to forecast an event that has not started). */
  touchEvent(eventKey: string) {
    this.eventState(eventKey);
  }

  hyperSnapshot() {
    const components: Record<string, { n: number; mu: number; tau: number; sigma: number }> = {};
    let fallback = 0;
    for (const c of this.spec.components) {
      const h = this.hyper.get(c.id)!;
      components[c.id] = { n: h.n, mu: h.mu, tau: Math.sqrt(h.tau2), sigma: Math.sqrt(h.sigma2) };
      fallback += h.sigma2 * (c.attribution === 'robot' ? 3 : 1);
    }
    return {
      components,
      /** Noise SDs at the season's typical scoring level; they scale as (μ/level)^(p/2). */
      totalNoiseSd: Math.sqrt(this.tot.value(fallback, this.tot.levelNow)),
      marginNoiseSd: Math.sqrt(this.marg.value(2 * fallback, this.marg.levelNow)),
      noiseScaling: { level: this.tot.levelNow, p: this.tot.p, marginP: this.marg.p },
      offset: this.offset,
      rp: this.rules.rp,
      bonusProbModels: Object.fromEntries([...this.logits].map(([k, l]) => [k, l.n])),
    };
  }
}
