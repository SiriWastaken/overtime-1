// Qualification ranking simulation: current ranking points from played matches plus Monte Carlo draws of the
// remaining schedule (win/tie RPs from win probability, bonus RPs from their forecast probabilities).

import { rng } from './stats.ts';
import type { MatchRow } from './types.ts';
import { played } from './types.ts';

export interface RemainingMatch {
  red: string[];
  blue: string[];
  /** Probabilities from the match forecast. */
  pRed: number;
  pTie: number;
  redBonus: number[];
  blueBonus: number[];
}

export interface RankSim {
  team: string;
  currentRp: number;
  played: number;
  expectedRp: number;
  meanRank: number;
  /** Probability of finishing in the top 8 / top 1. */
  top8: number;
  top1: number;
  rankDist: number[];
}

/**
 * Current qualification RP per team from breakdown `rp` fields. Surrogate appearances do not count toward
 * ranking, and disqualified teams receive no RP for that match.
 */
export function currentRp(matches: MatchRow[], surrogates: Map<string, Set<string>>, dqs: Map<string, Set<string>>) {
  const rp = new Map<string, number>();
  const n = new Map<string, number>();
  for (const m of matches) {
    if (m.compLevel !== 'qm' || !played(m) || !m.breakdown) continue;
    for (const color of ['red', 'blue'] as const) {
      const got = typeof m.breakdown[color].rp === 'number' ? (m.breakdown[color].rp as number) : 0;
      for (const t of m[color]) {
        if (surrogates.get(m.key)?.has(t)) continue;
        rp.set(t, (rp.get(t) ?? 0) + (dqs.get(m.key)?.has(t) ? 0 : got));
        n.set(t, (n.get(t) ?? 0) + 1);
      }
    }
  }
  return { rp, n };
}

export function simulateRankings(teams: string[], rpNow: Map<string, number>, playedNow: Map<string, number>, remaining: RemainingMatch[], winRp: number, tieRp: number, sims = 5000, seed = 3): RankSim[] {
  const rand = rng(seed);
  const N = teams.length;
  const idx = new Map(teams.map((t, i) => [t, i]));
  const dist = teams.map(() => new Array(N).fill(0));
  const sumRp = new Array(N).fill(0);
  const total = new Float64Array(N);
  const games = teams.map((t) => (playedNow.get(t) ?? 0) + remaining.filter((m) => m.red.includes(t) || m.blue.includes(t)).length);
  for (let s = 0; s < sims; s++) {
    teams.forEach((t, i) => (total[i] = rpNow.get(t) ?? 0));
    for (const m of remaining) {
      const u = rand();
      const red = u < m.pRed ? winRp : u < m.pRed + m.pTie ? tieRp : 0;
      const blue = u < m.pRed ? 0 : u < m.pRed + m.pTie ? tieRp : winRp;
      let rb = red;
      for (const p of m.redBonus) if (rand() < p) rb++;
      let bb = blue;
      for (const p of m.blueBonus) if (rand() < p) bb++;
      for (const t of m.red) if (idx.has(t)) total[idx.get(t)!] += rb;
      for (const t of m.blue) if (idx.has(t)) total[idx.get(t)!] += bb;
    }
    // Rank by average RP (ranking score); a random tiebreak stands in for the game-specific tiebreakers.
    const tb = teams.map(() => rand());
    const order = teams.map((_, i) => i).sort((a, b) => total[b] / Math.max(games[b], 1) - total[a] / Math.max(games[a], 1) || tb[a] - tb[b]);
    order.forEach((i, r) => dist[i][r]++);
    for (let i = 0; i < N; i++) sumRp[i] += total[i];
  }
  return teams
    .map((t, i) => {
      const d = dist[i].map((c) => c / sims);
      return {
        team: t,
        currentRp: rpNow.get(t) ?? 0,
        played: playedNow.get(t) ?? 0,
        expectedRp: sumRp[i] / sims,
        meanRank: d.reduce((a, p, r) => a + p * (r + 1), 0),
        top8: d.slice(0, 8).reduce((a, b) => a + b, 0),
        top1: d[0],
        rankDist: d,
      };
    })
    .sort((a, b) => a.meanRank - b.meanRank);
}
