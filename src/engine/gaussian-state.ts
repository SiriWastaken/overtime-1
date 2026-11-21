// Exact Bayesian linear-Gaussian state with full covariance (a static-state Kalman filter).
//
// Each entry is one latent parameter (e.g. team 254's teleop-fuel contribution at this event).
// An observation is a linear combination of entries plus Gaussian noise: y = Σ c_j x_{i_j} + ε, ε ~ N(0, R).
// Sequential rank-one updates give exactly the posterior of Bayesian linear regression (ridge regression with
// per-parameter priors), which is what lets alliance scores be split jointly and fairly across partners.

export interface Sparse {
  idx: number[];
  coef: number[];
}

export class GaussianState {
  n = 0;
  private cap: number;
  m: Float64Array;
  P: Float64Array;
  readonly keys: string[] = [];
  private readonly index = new Map<string, number>();
  /** Number of observations that touched each entry. */
  obs: Uint32Array;

  constructor(cap = 64) {
    this.cap = cap;
    this.m = new Float64Array(cap);
    this.P = new Float64Array(cap * cap);
    this.obs = new Uint32Array(cap);
  }

  has(key: string) {
    return this.index.has(key);
  }

  get(key: string): number {
    const i = this.index.get(key);
    if (i === undefined) throw new Error(`unknown state entry ${key}`);
    return i;
  }

  add(key: string, mean: number, variance: number): number {
    const existing = this.index.get(key);
    if (existing !== undefined) return existing;
    if (this.n === this.cap) this.grow();
    const i = this.n++;
    this.index.set(key, i);
    this.keys.push(key);
    this.m[i] = mean;
    this.P[i * this.cap + i] = variance;
    return i;
  }

  private grow() {
    const cap = this.cap * 2;
    const m = new Float64Array(cap);
    m.set(this.m);
    const P = new Float64Array(cap * cap);
    for (let i = 0; i < this.n; i++) P.set(this.P.subarray(i * this.cap, i * this.cap + this.n), i * cap);
    const obs = new Uint32Array(cap);
    obs.set(this.obs);
    this.cap = cap;
    this.m = m;
    this.P = P;
    this.obs = obs;
  }

  mean(i: number) {
    return this.m[i];
  }

  variance(i: number) {
    return this.P[i * this.cap + i];
  }

  /** Replace an entry's prior. Only valid for entries no observation has touched (their covariance row is zero). */
  resetPrior(i: number, mean: number, variance: number) {
    if (this.obs[i] !== 0) throw new Error('cannot reset an observed entry');
    this.m[i] = mean;
    this.P[i * this.cap + i] = variance;
  }

  /** Random-walk process noise on one entry (lets a robot's level drift during an event). */
  inflate(i: number, q: number) {
    this.P[i * this.cap + i] += q;
  }

  predictMean(h: Sparse): number {
    let s = 0;
    for (let k = 0; k < h.idx.length; k++) s += h.coef[k] * this.m[h.idx[k]];
    return s;
  }

  /** hA' P hB */
  covariance(a: Sparse, b: Sparse): number {
    let s = 0;
    const cap = this.cap;
    for (let x = 0; x < a.idx.length; x++) {
      const row = a.idx[x] * cap;
      for (let y = 0; y < b.idx.length; y++) s += a.coef[x] * b.coef[y] * this.P[row + b.idx[y]];
    }
    return s;
  }

  /** Condition on y = h'x + ε, ε ~ N(0, R). Returns the pre-update innovation and its parameter variance h'Ph. */
  update(h: Sparse, y: number, R: number): { innovation: number; paramVar: number } {
    const n = this.n;
    const cap = this.cap;
    const u = new Float64Array(n); // u = P h
    for (let k = 0; k < h.idx.length; k++) {
      const j = h.idx[k];
      const c = h.coef[k];
      for (let i = 0; i < n; i++) u[i] += c * this.P[i * cap + j];
    }
    let paramVar = 0;
    for (let k = 0; k < h.idx.length; k++) paramVar += h.coef[k] * u[h.idx[k]];
    const innovation = y - this.predictMean(h);
    const S = paramVar + R;
    const g = innovation / S;
    for (let i = 0; i < n; i++) this.m[i] += u[i] * g;
    for (let i = 0; i < n; i++) {
      const ui = u[i] / S;
      if (ui === 0) continue;
      const row = i * cap;
      for (let j = 0; j < n; j++) this.P[row + j] -= ui * u[j];
    }
    for (let i = 0; i < n; i++) if (this.P[i * cap + i] < 1e-9) this.P[i * cap + i] = 1e-9;
    for (const j of h.idx) this.obs[j]++;
    return { innovation, paramVar };
  }
}
