// L2-regularised one-feature logistic regression, refit by Newton's method on all samples seen so far.
// Used to map a predicted component total to the probability of achieving a bonus ranking point.

import { sigmoid } from './stats.ts';

export class OnlineLogit {
  private xs: number[] = [];
  private ys: number[] = [];
  private a = 0;
  private b = 0;
  private fittedAt = 0;
  private mean = 0;
  private sd = 1;

  constructor(
    private readonly refitEvery = 25,
    private readonly minSamples = 40,
    private readonly lambda = 1
  ) {}

  get n() {
    return this.xs.length;
  }

  add(x: number, y: boolean) {
    this.xs.push(x);
    this.ys.push(y ? 1 : 0);
    if (this.n >= this.minSamples && this.n - this.fittedAt >= this.refitEvery) this.fit();
  }

  /** Before enough samples, fall back to the (Laplace-smoothed) base rate. */
  predict(x: number): number {
    if (this.fittedAt === 0) {
      let k = 0;
      for (const y of this.ys) k += y;
      return (k + 1) / (this.n + 2);
    }
    return sigmoid(this.a + this.b * ((x - this.mean) / this.sd));
  }

  private fit() {
    const n = this.n;
    let s = 0;
    for (const x of this.xs) s += x;
    this.mean = s / n;
    let v = 0;
    for (const x of this.xs) v += (x - this.mean) ** 2;
    this.sd = Math.sqrt(v / n) || 1;
    let a = this.a;
    let b = this.b;
    for (let iter = 0; iter < 25; iter++) {
      let ga = 0, gb = this.lambda * b, haa = 1e-9, hab = 0, hbb = this.lambda;
      for (let i = 0; i < n; i++) {
        const z = (this.xs[i] - this.mean) / this.sd;
        const p = sigmoid(a + b * z);
        const w = p * (1 - p);
        ga += p - this.ys[i];
        gb += (p - this.ys[i]) * z;
        haa += w;
        hab += w * z;
        hbb += w * z * z;
      }
      const det = haa * hbb - hab * hab;
      if (det <= 0) break;
      const da = (hbb * ga - hab * gb) / det;
      const db = (haa * gb - hab * ga) / det;
      a -= da;
      b -= db;
      if (Math.abs(da) + Math.abs(db) < 1e-8) break;
    }
    this.a = a;
    this.b = b;
    this.fittedAt = n;
  }
}
