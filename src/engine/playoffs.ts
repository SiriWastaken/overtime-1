// Playoff bracket structures (by TBA playoff_type) and Monte Carlo bracket simulation that respects results
// already played.

import { rng } from './stats.ts';
import type { MatchRow } from './types.ts';
import { played } from './types.ts';

export type Source = { seed: number } | { winnerOf: string } | { loserOf: string };

export interface SeriesNode {
  id: string;
  /** TBA comp_level and set_number of the matches in this series. */
  level: 'qf' | 'sf' | 'f';
  set: number;
  bestOf: number;
  red: Source;
  blue: Source;
  round: string;
  bracket: 'upper' | 'lower' | 'final';
}

export interface Bracket {
  playoffType: number;
  name: string;
  nodes: SeriesNode[];
  /** The node whose winner wins the event. */
  final: string;
  alliances: number;
}

const s = (seed: number): Source => ({ seed });
const W = (id: string): Source => ({ winnerOf: id });
const L = (id: string): Source => ({ loserOf: id });

function de8(): Bracket {
  const n = (set: number, red: Source, blue: Source, round: string, bracket: SeriesNode['bracket']): SeriesNode => ({ id: `M${set}`, level: 'sf', set, bestOf: 1, red, blue, round, bracket });
  return {
    playoffType: 10,
    name: 'Double elimination (8 alliances)',
    alliances: 8,
    final: 'F',
    nodes: [
      n(1, s(1), s(8), 'Round 1', 'upper'),
      n(2, s(4), s(5), 'Round 1', 'upper'),
      n(3, s(2), s(7), 'Round 1', 'upper'),
      n(4, s(3), s(6), 'Round 1', 'upper'),
      n(5, L('M1'), L('M2'), 'Round 2', 'lower'),
      n(6, L('M3'), L('M4'), 'Round 2', 'lower'),
      n(7, W('M1'), W('M2'), 'Round 2', 'upper'),
      n(8, W('M3'), W('M4'), 'Round 2', 'upper'),
      n(9, L('M7'), W('M6'), 'Round 3', 'lower'),
      n(10, L('M8'), W('M5'), 'Round 3', 'lower'),
      n(11, W('M7'), W('M8'), 'Round 4', 'upper'),
      n(12, W('M10'), W('M9'), 'Round 4', 'lower'),
      n(13, L('M11'), W('M12'), 'Round 5', 'lower'),
      { id: 'F', level: 'f', set: 1, bestOf: 3, red: W('M11'), blue: W('M13'), round: 'Finals', bracket: 'final' },
    ],
  };
}

function de4(): Bracket {
  const n = (set: number, red: Source, blue: Source, round: string, bracket: SeriesNode['bracket']): SeriesNode => ({ id: `M${set}`, level: 'sf', set, bestOf: 1, red, blue, round, bracket });
  return {
    playoffType: 11,
    name: 'Double elimination (4 alliances)',
    alliances: 4,
    final: 'F',
    nodes: [
      n(1, s(1), s(4), 'Round 1', 'upper'),
      n(2, s(2), s(3), 'Round 1', 'upper'),
      n(3, L('M1'), L('M2'), 'Round 2', 'lower'),
      n(4, W('M1'), W('M2'), 'Round 2', 'upper'),
      n(5, L('M4'), W('M3'), 'Round 3', 'lower'),
      { id: 'F', level: 'f', set: 1, bestOf: 3, red: W('M4'), blue: W('M5'), round: 'Finals', bracket: 'final' },
    ],
  };
}

function single(alliances: 8 | 4 | 2, finalsBestOf = 3): Bracket {
  const nodes: SeriesNode[] = [];
  const node = (id: string, level: SeriesNode['level'], set: number, red: Source, blue: Source, round: string): SeriesNode => ({ id, level, set, bestOf: level === 'f' ? finalsBestOf : 3, red, blue, round, bracket: 'upper' });
  if (alliances === 8) {
    nodes.push(node('QF1', 'qf', 1, s(1), s(8), 'Quarterfinals'), node('QF2', 'qf', 2, s(4), s(5), 'Quarterfinals'), node('QF3', 'qf', 3, s(2), s(7), 'Quarterfinals'), node('QF4', 'qf', 4, s(3), s(6), 'Quarterfinals'));
    nodes.push(node('SF1', 'sf', 1, W('QF1'), W('QF2'), 'Semifinals'), node('SF2', 'sf', 2, W('QF3'), W('QF4'), 'Semifinals'));
    nodes.push(node('F', 'f', 1, W('SF1'), W('SF2'), 'Finals'));
  } else if (alliances === 4) {
    nodes.push(node('SF1', 'sf', 1, s(1), s(4), 'Semifinals'), node('SF2', 'sf', 2, s(2), s(3), 'Semifinals'));
    nodes.push(node('F', 'f', 1, W('SF1'), W('SF2'), 'Finals'));
  } else nodes.push(node('F', 'f', 1, s(1), s(2), 'Finals'));
  return { playoffType: -1, name: `${alliances}-alliance elimination bracket`, alliances, final: 'F', nodes };
}

/** Bracket for a TBA playoff_type, or null when the format cannot be simulated (round robin, average score, custom). */
export function bracketFor(playoffType: number | null): Bracket | null {
  switch (playoffType) {
    case 10:
      return de8();
    case 11:
      return de4();
    case 0:
      return { ...single(8), playoffType: 0 };
    case 2:
      return { ...single(4), playoffType: 2 };
    case 9:
      return { ...single(2), playoffType: 9, name: 'Finals only' };
    case 7:
      return { ...single(2, 3), playoffType: 7, name: 'Best-of-3 finals' };
    case 6:
      return { ...single(2, 5), playoffType: 6, name: 'Best-of-5 finals' };
    default:
      return null;
  }
}

export interface SeriesState {
  /** Alliance seeds actually observed in this series (from played matches), if any. */
  red: number | null;
  blue: number | null;
  redWins: number;
  blueWins: number;
  winner: number | null;
  matches: string[];
}

/** Read the actual state of each series from TBA matches, identifying alliances by their team keys. */
export function actualSeries(bracket: Bracket, matches: MatchRow[], seedOf: (team: string) => number | null): Map<string, SeriesState> {
  const out = new Map<string, SeriesState>();
  for (const node of bracket.nodes) {
    const ms = matches.filter((m) => m.compLevel === node.level && m.setNumber === node.set).sort((a, b) => a.matchNumber - b.matchNumber);
    const st: SeriesState = { red: null, blue: null, redWins: 0, blueWins: 0, winner: null, matches: ms.map((m) => m.key) };
    const need = Math.floor(node.bestOf / 2) + 1;
    for (const m of ms) {
      const rs = majority(m.red.map(seedOf));
      const bs = majority(m.blue.map(seedOf));
      if (rs !== null) st.red = rs;
      if (bs !== null) st.blue = bs;
      if (!played(m) || st.winner !== null) continue;
      if (m.winner === 'red') st.redWins++;
      else if (m.winner === 'blue') st.blueWins++;
      if (st.redWins >= need) st.winner = st.red;
      else if (st.blueWins >= need) st.winner = st.blue;
    }
    out.set(node.id, st);
  }
  return out;
}

function majority(xs: (number | null)[]): number | null {
  const counts = new Map<number, number>();
  for (const x of xs) if (x !== null) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best: number | null = null;
  let bc = 0;
  for (const [k, c] of counts)
    if (c > bc) {
      best = k;
      bc = c;
    }
  return best;
}

export interface SimResult {
  sims: number;
  /** seed → probability of winning the event. */
  champion: Record<number, number>;
  /** seed → node id → probability of playing in that series. */
  reach: Record<number, Record<string, number>>;
  /** node id → seed → probability of winning that series. */
  seriesWin: Record<string, Record<number, number>>;
}

/**
 * Monte Carlo bracket simulation. `pMatch(a, b)` is the probability alliance a beats alliance b in one match
 * (ties are replayed, so it is the conditional win probability). Completed series and games already won are kept.
 */
export function simulateBracket(bracket: Bracket, seeds: number[], pMatch: (a: number, b: number) => number, actual: Map<string, SeriesState> = new Map(), sims = 10000, seed = 7): SimResult {
  const rand = rng(seed);
  const champion: Record<number, number> = {};
  const reach: Record<number, Record<string, number>> = {};
  const seriesWin: Record<string, Record<number, number>> = {};
  for (const a of seeds) {
    champion[a] = 0;
    reach[a] = {};
  }
  for (const n of bracket.nodes) seriesWin[n.id] = {};
  const present = new Set(seeds);
  for (let it = 0; it < sims; it++) {
    const win = new Map<string, number>();
    const lose = new Map<string, number>();
    const resolve = (src: Source): number | null => ('seed' in src ? (present.has(src.seed) ? src.seed : null) : 'winnerOf' in src ? win.get(src.winnerOf) ?? null : lose.get(src.loserOf) ?? null);
    for (const node of bracket.nodes) {
      const act = actual.get(node.id);
      let r = act?.red ?? resolve(node.red);
      let b = act?.blue ?? resolve(node.blue);
      if (r === null && b === null) continue;
      if (r === null || b === null) {
        // A missing alliance (e.g. fewer alliances than the bracket expects) gives the other a bye.
        win.set(node.id, (r ?? b)!);
        continue;
      }
      reach[r][node.id] = (reach[r][node.id] ?? 0) + 1;
      reach[b][node.id] = (reach[b][node.id] ?? 0) + 1;
      let w: number;
      if (act?.winner != null) w = act.winner;
      else {
        const need = Math.floor(node.bestOf / 2) + 1;
        let rw = act?.redWins ?? 0;
        let bw = act?.blueWins ?? 0;
        const p = pMatch(r, b);
        while (rw < need && bw < need) rand() < p ? rw++ : bw++;
        w = rw >= need ? r : b;
      }
      win.set(node.id, w);
      lose.set(node.id, w === r ? b : r);
      seriesWin[node.id][w] = (seriesWin[node.id][w] ?? 0) + 1;
    }
    const champ = win.get(bracket.final);
    if (champ !== undefined) champion[champ]++;
  }
  for (const a of seeds) {
    champion[a] /= sims;
    for (const k of Object.keys(reach[a])) reach[a][k] /= sims;
  }
  for (const id of Object.keys(seriesWin)) for (const a of Object.keys(seriesWin[id])) seriesWin[id][+a] /= sims;
  return { sims, champion, reach, seriesWin };
}
