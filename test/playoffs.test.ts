import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { actualSeries, bracketFor, simulateBracket } from '../src/engine/playoffs.ts';
import { pickOrder } from '../src/engine/selection.ts';
import { simulateRankings } from '../src/engine/rankings.ts';
import type { MatchRow } from '../src/engine/types.ts';

const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
const even = () => 0.5;

describe('brackets', () => {
  it('double elimination: every alliance needs two losses, so all 8 can win', () => {
    const r = simulateBracket(bracketFor(10)!, seeds, even, new Map(), 20000);
    const total = Object.values(r.champion).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1) < 1e-9);
    // When every match is a coin flip, all alliances start symmetrically in the upper bracket: 1/8 each.
    for (const a of seeds) assert.ok(Math.abs(r.champion[a] - 1 / 8) < 0.015, `alliance ${a}: ${r.champion[a]}`);
  });

  it('a dominant alliance almost always wins', () => {
    const p = (a: number, b: number) => (a === 1 ? 0.95 : b === 1 ? 0.05 : 0.5);
    const r = simulateBracket(bracketFor(10)!, seeds, p, new Map(), 5000);
    assert.ok(r.champion[1] > 0.95);
  });

  it('respects played results', () => {
    const b = bracketFor(10)!;
    const mk = (set: number, red: string[], blue: string[], winner: 'red' | 'blue', level: 'sf' | 'f' = 'sf', n = 1): MatchRow => ({
      key: `x_${level}${set}m${n}`, eventKey: 'x', year: 2025, compLevel: level, setNumber: set, matchNumber: n, red, blue,
      redScore: winner === 'red' ? 100 : 50, blueScore: winner === 'red' ? 50 : 100, winner, time: 0, actualTime: 0, predictedTime: null, postResultTime: 1, breakdown: null,
    });
    const seedOf = (t: string) => Number(t.slice(1));
    // Alliance 8 upsets alliance 1 in M1.
    const actual = actualSeries(b, [mk(1, ['a1', 'a1', 'a1'], ['a8', 'a8', 'a8'], 'blue')], seedOf);
    assert.equal(actual.get('M1')!.winner, 8);
    const r = simulateBracket(b, seeds, even, actual, 4000);
    assert.equal(r.reach[1]['M7'] ?? 0, 0, 'loser of M1 cannot be in upper M7');
    assert.equal(r.reach[1]['M5'], 1, 'loser of M1 must play M5');
    assert.equal(r.reach[8]['M7'], 1);
  });

  it('best-of-3 finals honour a 1–0 lead', () => {
    const b = bracketFor(7)!; // best-of-3 finals between alliances 1 and 2
    const actual = new Map([['F', { red: 1, blue: 2, redWins: 1, blueWins: 0, winner: null, matches: [] }]]);
    const r = simulateBracket(b, [1, 2], even, actual, 20000);
    assert.ok(Math.abs(r.champion[1] - 0.75) < 0.02, `${r.champion[1]}`);
  });

  it('returns null for formats that cannot be simulated', () => {
    assert.equal(bracketFor(4), null); // round robin
    assert.equal(bracketFor(null), null);
  });
});

describe('selection', () => {
  it('uses a serpentine draft order', () => {
    assert.deepEqual(pickOrder(4, 2), [0, 1, 2, 3, 3, 2, 1, 0]);
  });
});

describe('ranking simulation', () => {
  it('locks in teams whose lead cannot be caught', () => {
    const teams = ['a', 'b', 'c', 'd', 'e', 'f'];
    const rp = new Map([['a', 30], ['b', 0], ['c', 0], ['d', 0], ['e', 0], ['f', 0]]);
    const n = new Map(teams.map((t) => [t, 10]));
    const remaining = [{ red: ['b', 'c', 'd'], blue: ['e', 'f', 'a'], pRed: 0.5, pTie: 0, redBonus: [0.5], blueBonus: [0.5] }];
    const r = simulateRankings(teams, rp, n, remaining, 3, 1, 2000);
    assert.equal(r[0].team, 'a');
    assert.equal(r[0].top1, 1);
  });
});
