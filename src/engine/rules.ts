// Recover fixed game-rule constants from the season's own score breakdowns.
//
// Per-robot categorical fields (e.g. endGameRobot1 = "DeepCage") are worth a fixed number of points by rule.
// Rather than hard-coding values (and silently going wrong when a manual changes), we solve
//   componentPoints(alliance) = Σ_category count(category) × value(category)
// by least squares over the season. A rule is exact, so the fit residual should be ~0; the residual is reported
// as a data-quality diagnostic. These are rules, not performance, so using the whole season is not leakage.

import type { ComponentSpec, SeasonSpec } from './seasons.ts';
import { num } from './seasons.ts';
import { solveSpd } from './stats.ts';
import type { MatchRow } from './types.ts';
import { played } from './types.ts';

export interface CategoryFit {
  values: Record<string, number>;
  n: number;
  rmse: number;
}

export interface RuleFits {
  categories: Record<string, CategoryFit>;
  rp: { win: number; tie: number; n: number; rmse: number; inferred: boolean };
}

function leastSquares(rows: { x: number[]; y: number }[], p: number): { beta: number[]; rmse: number } | null {
  if (rows.length < p) return null;
  const A = new Float64Array(p * p);
  const b = new Float64Array(p);
  for (const { x, y } of rows) {
    for (let i = 0; i < p; i++) {
      b[i] += x[i] * y;
      for (let j = 0; j < p; j++) A[i * p + j] += x[i] * x[j];
    }
  }
  for (let i = 0; i < p; i++) A[i * p + i] += 1e-6; // tiny ridge keeps never-varying categories solvable
  const sol = solveSpd(A, b, p);
  if (!sol) return null;
  const beta = Array.from(sol, (v) => (Math.abs(v - Math.round(v * 2) / 2) < 0.05 ? Math.round(v * 2) / 2 : v));
  let se = 0;
  for (const { x, y } of rows) {
    let yh = 0;
    for (let i = 0; i < p; i++) yh += x[i] * beta[i];
    se += (y - yh) ** 2;
  }
  return { beta, rmse: Math.sqrt(se / rows.length) };
}

export function inferCategoryValues(matches: MatchRow[], comp: ComponentSpec): CategoryFit | null {
  if (comp.attribution !== 'robot' || !comp.robotField) return null;
  const cats = new Map<string, number>();
  const raw: { counts: Map<string, number>; y: number }[] = [];
  for (const m of matches) {
    if (!played(m) || !m.breakdown) continue;
    for (const color of ['red', 'blue'] as const) {
      const b = m.breakdown[color];
      const y = comp.points(b, color === 'red' ? m.redScore! : m.blueScore!);
      if (y === null) continue;
      const counts = new Map<string, number>();
      let ok = true;
      for (let s = 1; s <= 3; s++) {
        const v = b[comp.robotField(s)];
        if (typeof v !== 'string') {
          ok = false;
          break;
        }
        if (!cats.has(v)) cats.set(v, cats.size);
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      if (ok) raw.push({ counts, y });
    }
  }
  const p = cats.size;
  if (p === 0) return null;
  const rows = raw.map(({ counts, y }) => {
    const x = new Array(p).fill(0);
    for (const [c, k] of counts) x[cats.get(c)!] = k;
    return { x, y };
  });
  const fit = leastSquares(rows, p);
  if (!fit) return null;
  const values: Record<string, number> = {};
  for (const [c, i] of cats) values[c] = fit.beta[i];
  return { values, n: rows.length, rmse: fit.rmse };
}

/** Qualification RP = win·W + tie·T + Σ bonus RPs. Infer W and T from the breakdown's `rp` field. */
export function inferRpValues(matches: MatchRow[], spec: SeasonSpec): RuleFits['rp'] {
  const fallback = { win: spec.year >= 2025 ? 3 : 2, tie: 1, n: 0, rmse: NaN, inferred: false };
  if (spec.bonuses.length === 0) return fallback;
  const rows: { x: number[]; y: number }[] = [];
  for (const m of matches) {
    if (m.compLevel !== 'qm' || !played(m) || !m.breakdown) continue;
    for (const color of ['red', 'blue'] as const) {
      const b = m.breakdown[color];
      const rp = num(b, 'rp');
      if (rp === null) continue;
      let bonus = 0;
      for (const bs of spec.bonuses) if (b[bs.key] === true) bonus++;
      const win = m.winner === color ? 1 : 0;
      const tie = m.winner === 'tie' ? 1 : 0;
      rows.push({ x: [win, tie], y: rp - bonus });
    }
  }
  const fit = rows.length >= 20 ? leastSquares(rows, 2) : null;
  if (!fit) return fallback;
  return { win: Math.round(fit.beta[0]), tie: Math.round(fit.beta[1]), n: rows.length, rmse: fit.rmse, inferred: true };
}

export function inferRules(matches: MatchRow[], spec: SeasonSpec): RuleFits {
  const categories: Record<string, CategoryFit> = {};
  for (const c of spec.components) {
    const fit = inferCategoryValues(matches, c);
    if (fit) categories[c.id] = fit;
  }
  return { categories, rp: inferRpValues(matches, spec) };
}
