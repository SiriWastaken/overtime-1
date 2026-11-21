// On-demand event analyses built from stored outputs: playoff bracket simulation, qualification ranking
// simulation and alliance-selection pick values. Results are memoised per (event, model run).

import { netValue, quickForecast, type Noise, type TeamState } from '../engine/forecast.ts';
import { actualSeries, bracketFor, simulateBracket, type Bracket, type SeriesState, type SimResult } from '../engine/playoffs.ts';
import { currentRp, simulateRankings, type RankSim } from '../engine/rankings.ts';
import { seasonSpec, type SeasonSpec } from '../engine/seasons.ts';
import { allianceWinMatrix, evaluatePicks, type PickOption } from '../engine/selection.ts';
import { event, eventMatches, eventResource, eventTeamRatings, modelRun, teamRating, type EventSummary } from './queries.ts';

const memo = new Map<string, unknown>();
function cached<T>(key: string, fn: () => T): T {
  if (!memo.has(key)) {
    if (memo.size > 500) memo.clear();
    memo.set(key, fn());
  }
  return memo.get(key) as T;
}

export interface TbaAlliance {
  name?: string | null;
  picks: string[];
  backup?: { in: string; out: string } | null;
  declines?: string[];
  status?: { status?: string; level?: string; record?: { wins: number; losses: number; ties: number } | null } | null;
}

interface Context {
  ev: EventSummary;
  spec: SeasonSpec;
  noise: Noise;
  teams: Map<string, TeamState>;
  runId: number;
}

function context(eventKey: string, stage: 'latest' | 'pre_playoff' = 'latest'): Context | null {
  const ev = event(eventKey);
  if (!ev) return null;
  const run = modelRun(ev.year);
  if (!run) return null;
  const ratings = eventTeamRatings(eventKey, stage);
  if (ratings.size === 0) return null;
  const teams = new Map<string, TeamState>([...ratings].map(([k, r]) => [k, { team: k, comps: r.comps }]));
  const noise = { totalNoiseSd: run.hyper.totalNoiseSd, marginNoiseSd: run.hyper.marginNoiseSd, offset: run.hyper.offset, scaling: run.hyper.noiseScaling };
  return { ev, spec: seasonSpec(ev.year), noise, teams, runId: run.id };
}

/** Alliance members including a backup robot that was called in. */
const members = (a: TbaAlliance) => [...a.picks, ...(a.backup?.in ? [a.backup.in] : [])];

export interface PlayoffAnalysis {
  bracket: Bracket | null;
  formatNote: string | null;
  alliances: { seed: number; name: string; teams: string[]; expected: number; sd: number }[];
  actual: Record<string, SeriesState>;
  sim: SimResult | null;
  /** Title odds from estimates frozen before the first playoff match, ignoring any results (null before playoffs). */
  before: Record<number, number> | null;
  /** Probability alliance i (row, seed i+1) beats alliance j in a single match. */
  matrix: number[][];
}

export function playoffAnalysis(eventKey: string): PlayoffAnalysis | null {
  const ctx = context(eventKey);
  if (!ctx) return null;
  const al = eventResource<TbaAlliance[]>(eventKey, 'alliances')?.data;
  return cached(`po:${eventKey}:${ctx.runId}`, () => {
    const bracket = bracketFor(ctx.ev.playoff_type);
    if (!al || al.length === 0) return { bracket, formatNote: null, alliances: [], actual: {}, sim: null, before: null, matrix: [] };
    const allianceTeams = al.map(members);
    const seedOf = new Map<string, number>();
    allianceTeams.forEach((ts, i) => ts.forEach((t) => seedOf.set(t, i + 1)));
    const matrix = allianceWinMatrix(ctx.spec, ctx.noise, ctx.teams, allianceTeams);
    const alliances = allianceTeams.map((teams, i) => {
      const lineup = teams.map((t) => ctx.teams.get(t)).filter((x): x is TeamState => Boolean(x)).sort((a, b) => netValue(ctx.spec, b) - netValue(ctx.spec, a)).slice(0, 3);
      const f = quickForecast(ctx.spec, ctx.noise, lineup, []).red;
      return { seed: i + 1, name: al[i].name ?? `Alliance ${i + 1}`, teams, expected: f.mean, sd: f.sd };
    });
    if (!bracket)
      return {
        bracket: null,
        formatNote: `This event uses "${ctx.ev.playoff_type_string ?? 'an unknown format'}", which Overtime 1 does not simulate. Alliance strengths are shown; the bracket is not.`,
        alliances,
        actual: {},
        sim: null,
        before: null,
        matrix,
      };
    const matches = eventMatches(eventKey).filter((m) => m.compLevel !== 'qm');
    const actual = actualSeries(bracket, matches, (t) => seedOf.get(t) ?? null);
    const seeds = alliances.map((a) => a.seed).filter((s) => s <= bracket.alliances);
    const sim = simulateBracket(bracket, seeds, (a, b) => matrix[a - 1][b - 1], actual, 20000);
    const pre = context(eventKey, 'pre_playoff');
    let before: Record<number, number> | null = null;
    if (pre && pre.teams.size) {
      const m0 = allianceWinMatrix(pre.spec, pre.noise, pre.teams, allianceTeams);
      before = simulateBracket(bracket, seeds, (a, b) => m0[a - 1][b - 1], new Map(), 20000).champion;
    }
    return { bracket, formatNote: null, alliances, actual: Object.fromEntries(actual), sim, before, matrix };
  });
}

export interface RankingAnalysis {
  rows: RankSim[];
  remaining: number;
  official: Map<string, number>;
}

export function rankingAnalysis(eventKey: string): RankingAnalysis | null {
  const ctx = context(eventKey);
  if (!ctx) return null;
  return cached(`rk:${eventKey}:${ctx.runId}`, () => {
    const run = modelRun(ctx.ev.year)!;
    const matches = eventMatches(eventKey).filter((m) => m.compLevel === 'qm');
    const sur = new Map(matches.map((m) => [m.key, new Set(m.surrogates)]));
    const dq = new Map(matches.map((m) => [m.key, new Set(m.dqs)]));
    const { rp, n } = currentRp(matches, sur, dq);
    const remaining = matches
      .filter((m) => m.redScore === null && m.prediction)
      .map((m) => {
        const f = m.prediction!.forecast;
        return {
          red: m.red.filter((t) => !sur.get(m.key)?.has(t)),
          blue: m.blue.filter((t) => !sur.get(m.key)?.has(t)),
          pRed: f.red.rp?.win ?? f.redWinProb,
          pTie: f.tieProb,
          redBonus: Object.values(f.red.rp?.bonuses ?? {}),
          blueBonus: Object.values(f.blue.rp?.bonuses ?? {}),
        };
      });
    const teams = [...new Set([...ctx.teams.keys(), ...matches.flatMap((m) => [...m.red, ...m.blue])])];
    const rows = simulateRankings(teams, rp, n, remaining, run.rules.rp.win, run.rules.rp.tie);
    const rk = eventResource<{ rankings: { team_key: string; rank: number }[] }>(eventKey, 'rankings')?.data;
    const official = new Map((rk?.rankings ?? []).map((r) => [r.team_key, r.rank]));
    return { rows, remaining: remaining.length, official };
  });
}

export interface SelectionAnalysis {
  captains: string[];
  captainSeed: number;
  options: PickOption[];
  basis: 'official rankings' | 'projected rankings';
  perAlliance: number;
  bracketName: string;
  /** True when estimates are the pre-playoff snapshot. */
  frozen: boolean;
}

export function selectionAnalysis(eventKey: string, captainSeed: number): SelectionAnalysis | { error: string } {
  // Once playoffs have started, replay selection from estimates frozen before them (no playoff results).
  const frozen = eventTeamRatings(eventKey, 'pre_playoff').size > 0;
  const ctx = context(eventKey, frozen ? 'pre_playoff' : 'latest');
  if (!ctx) return { error: 'No model outputs for this event yet.' };
  const bracket = bracketFor(ctx.ev.playoff_type) ?? bracketFor(10)!;
  const nAlliances = bracket.alliances;
  if (!(captainSeed >= 1 && captainSeed <= nAlliances)) return { error: `Captain seed must be 1–${nAlliances}.` };
  return cached(`sel:${eventKey}:${ctx.runId}:${captainSeed}`, () => {
    const ranks = rankingAnalysis(eventKey);
    const official = [...(ranks?.official ?? new Map())].sort((a, b) => a[1] - b[1]).map(([t]) => t);
    const qualsDone = (ranks?.remaining ?? 1) === 0 && official.length >= nAlliances;
    const order = qualsDone ? official : (ranks?.rows ?? []).map((r) => r.team);
    const captains = order.filter((t) => ctx.teams.has(t)).slice(0, nAlliances);
    const perAlliance = ctx.ev.event_type === 3 ? 4 : 3;
    const options = evaluatePicks(ctx.spec, ctx.noise, { captains, teams: ctx.teams, perAlliance }, bracket, captainSeed);
    return { captains, captainSeed, options, basis: qualsDone ? 'official rankings' : 'projected rankings', perAlliance, bracketName: bracket.name, frozen };
  });
}

/** Ad-hoc forecast for any two alliances, using each team's latest event estimate (or season rating). */
export function adHocForecast(year: number, red: string[], blue: string[], eventKey?: string) {
  const run = modelRun(year);
  if (!run) return null;
  const spec = seasonSpec(year);
  const noise = { totalNoiseSd: run.hyper.totalNoiseSd, marginNoiseSd: run.hyper.marginNoiseSd, offset: run.hyper.offset, scaling: run.hyper.noiseScaling };
  const evRatings = eventKey ? eventTeamRatings(eventKey) : new Map();
  const missing: string[] = [];
  const state = (t: string): TeamState | null => {
    const er = evRatings.get(t);
    if (er) return { team: t, comps: er.comps };
    const r = seasonState(year, t);
    if (!r) missing.push(t);
    return r;
  };
  const rs = red.map(state).filter((x): x is TeamState => Boolean(x));
  const bs = blue.map(state).filter((x): x is TeamState => Boolean(x));
  if (missing.length) return { error: `No ${year} rating for ${missing.join(', ')}` };
  return { forecast: quickForecast(spec, noise, rs, bs), basis: eventKey ? `event ${eventKey} estimates` : 'latest season ratings', runId: run.id, version: run.version };
}

function seasonState(year: number, team: string): TeamState | null {
  const r = teamRating(year, team)?.rating;
  if (!r) return null;
  const comps: TeamState['comps'] = { ...r.components };
  const spec = seasonSpec(year);
  const foul = spec.components.find((c) => c.attribution === 'opponent');
  if (foul) comps[foul.id] = r.fouls;
  return { team, comps };
}
