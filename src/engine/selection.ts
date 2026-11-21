// Alliance selection analysis: value each available pick by the probability the resulting alliance wins the
// event, simulating the rest of the draft and the actual playoff format. Picking by rating alone ignores that
// win probability is non-linear in strength and variance and depends on which alliances the pick leaves for
// rivals; simulating the bracket captures both.

import { quickForecast, netValue, type Noise, type TeamState } from './forecast.ts';
import { simulateBracket, type Bracket } from './playoffs.ts';
import type { SeasonSpec } from './seasons.ts';

export interface DraftSetup {
  /** Captains in seed order (alliance 1 first). */
  captains: string[];
  /** Team pool by key. */
  teams: Map<string, TeamState>;
  /** Robots per alliance (3, or 4 at Championship divisions). */
  perAlliance: number;
}

/** Serpentine pick order: round 1 seeds 1→N, round 2 N→1, round 3 1→N. */
export function pickOrder(nAlliances: number, rounds: number): number[] {
  const out: number[] = [];
  for (let r = 0; r < rounds; r++) {
    const seq = Array.from({ length: nAlliances }, (_, i) => i);
    out.push(...(r % 2 === 0 ? seq : seq.reverse()));
  }
  return out;
}

/** Complete a draft greedily (every captain takes the best available net value), with some picks forced. */
export function completeDraft(spec: SeasonSpec, setup: DraftSetup, forced: Map<number, string> = new Map()): string[][] {
  const alliances = setup.captains.map((c) => [c]);
  const taken = new Set(setup.captains);
  const pool = [...setup.teams.values()].filter((t) => !taken.has(t.team)).sort((a, b) => netValue(spec, b) - netValue(spec, a));
  const order = pickOrder(setup.captains.length, setup.perAlliance - 1);
  order.forEach((a, k) => {
    const f = forced.get(k);
    const pick = f && !taken.has(f) ? f : pool.find((t) => !taken.has(t.team))?.team;
    if (!pick) return;
    taken.add(pick);
    alliances[a].push(pick);
  });
  return alliances;
}

/** The three robots expected to play: the highest net values in the alliance. */
function lineup(spec: SeasonSpec, teams: Map<string, TeamState>, alliance: string[]) {
  return alliance
    .map((k) => teams.get(k)!)
    .filter(Boolean)
    .sort((a, b) => netValue(spec, b) - netValue(spec, a))
    .slice(0, 3);
}

export function allianceWinMatrix(spec: SeasonSpec, noise: Noise, teams: Map<string, TeamState>, alliances: string[][]) {
  const n = alliances.length;
  const ups = alliances.map((a) => lineup(spec, teams, a));
  const P: number[][] = Array.from({ length: n }, () => new Array(n).fill(0.5));
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const p = quickForecast(spec, noise, ups[i], ups[j]).redWinProb;
      P[i][j] = p;
      P[j][i] = 1 - p;
    }
  return P;
}

export interface PickOption {
  team: string;
  net: number;
  /** Probability the captain's alliance wins the event with this pick (rest of the draft simulated greedily). */
  eventWin: number;
  /** Expected alliance score of the captain, this pick and the projected second pick. */
  allianceMean: number;
  allianceSd: number;
}

export function evaluatePicks(spec: SeasonSpec, noise: Noise, setup: DraftSetup, bracket: Bracket, captainSeed: number, candidates = 16, sims = 4000): PickOption[] {
  const a = captainSeed - 1;
  const order = pickOrder(setup.captains.length, setup.perAlliance - 1);
  const firstTurn = order.indexOf(a);
  // Teams already gone before the captain's first turn under the greedy assumption.
  const before = completeDraft(spec, { ...setup, perAlliance: 2 }).flatMap((x, i) => (order.indexOf(i) < firstTurn ? x.slice(1) : []));
  const gone = new Set([...setup.captains, ...before]);
  const pool = [...setup.teams.values()].filter((t) => !gone.has(t.team)).sort((x, y) => netValue(spec, y) - netValue(spec, x)).slice(0, candidates);
  const seeds = setup.captains.map((_, i) => i + 1);
  return pool
    .map((cand) => {
      const alliances = completeDraft(spec, setup, new Map([[firstTurn, cand.team]]));
      const P = allianceWinMatrix(spec, noise, setup.teams, alliances);
      const sim = simulateBracket(bracket, seeds, (x, y) => P[x - 1][y - 1], new Map(), sims, 11);
      const self = quickForecast(spec, noise, lineup(spec, setup.teams, alliances[a]), []).red;
      return { team: cand.team, net: netValue(spec, cand), eventWin: sim.champion[captainSeed], allianceMean: self.mean, allianceSd: self.sd };
    })
    .sort((x, y) => y.eventWin - x.eventWin);
}
