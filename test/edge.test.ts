import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkEdgeScale, computeEdges, edgeContext, type EdgeCheckItem, type NetEstimate } from '../src/engine/edge.ts';
import { gaussian, normalCdf, rng } from '../src/engine/stats.ts';

const close = (a: number, b: number, tol: number, msg?: string) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b}, got ${a}`);

// A season pool of robots with Gaussian nets (mean 40, sd 15), constant noise.
function pool(n = 400, seed = 3): NetEstimate[] {
  const g = gaussian(rng(seed));
  return Array.from({ length: n }, (_, i) => {
    const net = 40 + 15 * g();
    return { team: `frc${i + 1}`, net, sd: 4, gross: net, matches: 12 };
  });
}
const noise = { totalNoiseSd: 0, marginNoiseSd: 25, offset: 0 };

describe('EDGE', () => {
  const p = pool();
  const ctx = edgeContext(p, noise, 20000)!;
  const edges = computeEdges(p, ctx);

  it('is zero for the replacement-level robot and increasing in net', () => {
    const [z] = computeEdges([{ team: 'r', net: ctx.replacement, sd: 0, gross: ctx.replacementGross, matches: 12 }], ctx);
    close(z.edge, 0, 1e-12);
    const sorted = [...edges].sort((a, b) => a.net - b.net);
    for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].edge >= sorted[i - 1].edge);
  });

  it('brackets the point estimate with its 80% interval and stays inside (−1, 1)', () => {
    for (const e of edges) {
      assert.ok(e.lo80 <= e.edge && e.edge <= e.hi80);
      assert.ok(e.lo80 > -1 && e.hi80 < 1);
    }
  });

  it('matches the closed form for Gaussian contexts and constant noise', () => {
    // Context D = 2 partners − 3 opponents ~ N(−μ, 5v); E[Φ((D+x)/s)] = Φ((x − μ)/√(s² + 5v)).
    const nets = p.map((x) => x.net);
    const mu = nets.reduce((a, b) => a + b, 0) / nets.length;
    const v = nets.reduce((a, b) => a + (b - mu) ** 2, 0) / nets.length;
    const S = Math.sqrt(25 ** 2 + 5 * 16 + 5 * v);
    const exact = (x: number) => normalCdf((x - mu) / S) - normalCdf((ctx.replacement - mu) / S);
    for (const e of edges.filter((_, i) => i % 40 === 0)) close(e.edge, exact(e.net), 0.01, e.team);
  });

  it('refuses to produce a context from too few rated robots', () => {
    assert.equal(edgeContext(pool(8), noise), null);
    assert.equal(edgeContext(p.map((x) => ({ ...x, matches: 1 })), noise), null);
  });
});

describe('EDGE scale check', () => {
  // Synthetic season where outcomes follow the margin model exactly.
  function items(): EdgeCheckItem[] {
    const g = gaussian(rng(9));
    const truth = Array.from({ length: 60 }, (_, i) => ({ team: `frc${i}`, net: 40 + 15 * g() }));
    const rand = rng(11);
    return Array.from({ length: 1500 }, (_, k) => {
      const six = Array.from({ length: 6 }, () => truth[Math.floor(rand() * truth.length)]);
      const c = (t: (typeof truth)[number]) => ({ team: t.team, total: t.net, sd: 3, defense: 0, fouls: 0, matches: 10 });
      const margin = six.slice(0, 3).reduce((a, t) => a + t.net, 0) - six.slice(3).reduce((a, t) => a + t.net, 0) + 25 * g();
      return { t: k, red: six.slice(0, 3).map(c), blue: six.slice(3).map(c), level: 120, noiseVar: 625, y: margin > 0 ? 1 : 0, xptsRedWinProb: 0.5, playoff: false };
    });
  }

  it('beats a coin flip and recovers roughly unit scale when the model is right', () => {
    const r = checkEdgeScale(items());
    const s = r.splits.all;
    assert.ok(s.brier.edge < s.brier.coinFlip);
    assert.ok(s.slope > 0.7 && s.slope < 1.4, `slope ${s.slope}`);
  });

  it('does not depend on input order (sorted by information time)', () => {
    const a = items();
    const shuffled = [...a].reverse();
    assert.deepEqual(checkEdgeScale(a), checkEdgeScale(shuffled));
  });
});
