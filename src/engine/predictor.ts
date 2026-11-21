// The contract every forecaster (the main model and all baselines) implements, plus the leakage-free
// walk-forward driver that feeds them.

import type { MatchRow } from './types.ts';
import { played } from './types.ts';

export interface Forecast {
  redMean: number;
  blueMean: number;
  /** Predictive SD of each alliance's score (absent for baselines that do not model uncertainty). */
  redSd?: number;
  blueSd?: number;
  redWinProb: number;
}

export interface Predictor<F extends Forecast = Forecast> {
  readonly id: string;
  readonly label: string;
  /** Forecast `m` using only results already passed to observe(). */
  predict(m: MatchRow, cutoff: number): F | null;
  observe(m: MatchRow, availableAt: number): void;
}

const LEVEL_ORDER: Record<string, number> = { qm: 0, ef: 1, qf: 2, sf: 3, f: 4 };

/**
 * Time at which a match starts (when a forecast must be frozen) and time its result became public.
 * Missing TBA timestamps are replaced by a deterministic synthetic schedule from the event start date so that
 * ordering is still chronological; results are assumed public 5 minutes after the start when not recorded.
 */
export function timeline(matches: MatchRow[], eventStart: (eventKey: string) => string) {
  const start = new Map<string, number>();
  const avail = new Map<string, number>();
  const byEvent = new Map<string, MatchRow[]>();
  for (const m of matches) {
    const list = byEvent.get(m.eventKey) ?? [];
    list.push(m);
    byEvent.set(m.eventKey, list);
  }
  for (const [ek, list] of byEvent) {
    list.sort((a, b) => LEVEL_ORDER[a.compLevel] - LEVEL_ORDER[b.compLevel] || a.setNumber - b.setNumber || a.matchNumber - b.matchNumber);
    const base = Date.parse(`${eventStart(ek)}T12:00:00Z`) / 1000;
    let prev = Number.isFinite(base) ? base : 0;
    list.forEach((m, i) => {
      // Keep the synthetic clock monotone and never behind a real timestamp we have already seen.
      const s = m.actualTime ?? m.time ?? Math.max(prev + 1, (Number.isFinite(base) ? base : 0) + i * 420);
      prev = Math.max(prev, s);
      start.set(m.key, s);
      const pr = m.postResultTime;
      // Strictly after the start, so a match's own result can never be revealed before its forecast.
      avail.set(m.key, pr !== null && pr > s ? pr : s + 300);
    });
  }
  return { start, avail };
}

export interface WalkForwardResult<F extends Forecast> {
  /** Pre-match forecasts keyed by predictor id, then match key. */
  forecasts: Map<string, Map<string, F>>;
  cutoffs: Map<string, number>;
  /** Matches with results, in the order they were forecast. */
  order: MatchRow[];
  unplayed: MatchRow[];
}

/**
 * Walk forward through the season. Before forecasting a match that starts at time s, every result that was
 * public at or before s (post_result_time ≤ s) is revealed to the predictors, and nothing else. A match's own
 * result, later matches, final rankings and playoff results are therefore never visible to its forecast.
 */
export function walkForward(matches: MatchRow[], predictors: Predictor[], eventStart: (k: string) => string): WalkForwardResult<Forecast> {
  const { start, avail } = timeline(matches, eventStart);
  const done = matches.filter(played).sort((a, b) => start.get(a.key)! - start.get(b.key)! || a.key.localeCompare(b.key));
  const unplayed = matches.filter((m) => !played(m));
  const pending = [...done].sort((a, b) => avail.get(a.key)! - avail.get(b.key)! || start.get(a.key)! - start.get(b.key)!);
  let p = 0;
  let asOf = 0;
  const forecasts = new Map<string, Map<string, Forecast>>(predictors.map((x) => [x.id, new Map()]));
  const cutoffs = new Map<string, number>();
  const reveal = (until: number) => {
    while (p < pending.length && avail.get(pending[p].key)! <= until) {
      const r = pending[p++];
      const at = avail.get(r.key)!;
      for (const x of predictors) x.observe(r, at);
      asOf = Math.max(asOf, at);
    }
  };
  for (const m of done) {
    const s = start.get(m.key)!;
    reveal(s);
    cutoffs.set(m.key, asOf);
    for (const x of predictors) {
      const f = x.predict(m, asOf);
      if (f) forecasts.get(x.id)!.set(m.key, f);
    }
  }
  reveal(Infinity);
  return { forecasts, cutoffs, order: done, unplayed };
}
