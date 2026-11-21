// TEST-ONLY synthetic season with known ground truth (REEFSCAPE-shaped breakdowns).
// Never used by the application: it exists so model recovery, calibration and leakage can be tested.

import { gaussian, rng } from '../src/engine/stats.ts';
import type { EventInfo, MatchRow, SeasonData } from '../src/engine/types.ts';

export interface TrueTeam {
  key: string;
  leave: number; // P(auto leave)
  autoCoral: number;
  teleopCoral: number;
  algae: number;
  climb: number; // 0..1 skill
  fouls: number; // foul points conceded per match
  growth: number; // fractional improvement per week
}

const BARGE = { DeepCage: 12, ShallowCage: 6, Parked: 2, None: 0 } as const;

export function trueNet(t: TrueTeam, week: number) {
  const g = 1 + t.growth * week;
  const pDeep = t.climb * t.climb, pShallow = t.climb * (1 - t.climb), pPark = (1 - t.climb) * 0.7;
  return 3 * t.leave + g * (t.autoCoral + t.teleopCoral + t.algae) + 12 * pDeep + 6 * pShallow + 2 * pPark - t.fouls;
}

export function syntheticSeason(seed = 1, nTeams = 240, nEvents = 12, teamsPerEvent = 40, matchesPerTeam = 12) {
  const rand = rng(seed);
  const norm = gaussian(rand);
  const teams: TrueTeam[] = Array.from({ length: nTeams }, (_, i) => ({
    key: `frc${i + 1}`,
    leave: 0.6 + 0.4 * rand(),
    autoCoral: Math.max(0, 6 + 4 * norm()),
    teleopCoral: Math.max(0, 20 + 10 * norm()),
    algae: Math.max(0, 6 + 5 * norm()),
    climb: rand(),
    fouls: Math.max(0, 1.5 + 1 * norm()),
    growth: Math.max(0, 0.04 + 0.03 * norm()),
  }));
  const byKey = new Map(teams.map((t) => [t.key, t]));
  const events: EventInfo[] = [];
  const matches: MatchRow[] = [];
  const eventTeams = new Map<string, string[]>();
  // Each team attends nEvents*teamsPerEvent/nTeams events, spread over weeks.
  const slots: string[] = [];
  while (slots.length < nEvents * teamsPerEvent) slots.push(...teams.map((t) => t.key));
  const pool = slots.slice(0, nEvents * teamsPerEvent);

  for (let e = 0; e < nEvents; e++) {
    const week = Math.floor(e / 2);
    const key = `2025syn${e}`;
    const day = new Date(Date.UTC(2025, 2, 1 + week * 7 + (e % 2)));
    const startDate = day.toISOString().slice(0, 10);
    events.push({ key, year: 2025, name: `Synthetic ${e}`, shortName: `Syn ${e}`, eventType: 0, week, startDate, endDate: startDate, playoffType: 10, parentEventKey: null });
    const roster = [...new Set(pool.slice(e * teamsPerEvent, (e + 1) * teamsPerEvent))];
    eventTeams.set(key, roster);
    const rounds = Math.ceil((matchesPerTeam * roster.length) / 6);
    const base = day.getTime() / 1000 + 12 * 3600;
    let order: string[] = [];
    for (let mi = 0; mi < rounds; mi++) {
      if (order.length < 6) {
        const shuffled = [...roster].sort(() => rand() - 0.5);
        order = [...order, ...shuffled.filter((t) => !order.includes(t))];
      }
      const six = order.splice(0, 6);
      const red = six.slice(0, 3), blue = six.slice(3, 6);
      const side = (own: string[], opp: string[]) => {
        const g = (t: TrueTeam) => 1 + t.growth * week;
        const ts = own.map((k) => byKey.get(k)!);
        const b: Record<string, unknown> = {};
        let leave = 0, barge = 0;
        ts.forEach((t, i) => {
          const left = rand() < t.leave;
          b[`autoLineRobot${i + 1}`] = left ? 'Yes' : 'No';
          leave += left ? 3 : 0;
          const u = rand();
          const pDeep = t.climb * t.climb, pShallow = t.climb * (1 - t.climb), pPark = (1 - t.climb) * 0.7;
          const cat = u < pDeep ? 'DeepCage' : u < pDeep + pShallow ? 'ShallowCage' : u < pDeep + pShallow + pPark ? 'Parked' : 'None';
          b[`endGameRobot${i + 1}`] = cat;
          barge += BARGE[cat];
        });
        const draw = (mean: number, rel: number) => Math.max(0, Math.round(mean + (rel * mean + 2) * norm()));
        const autoCoral = draw(ts.reduce((a, t) => a + g(t) * t.autoCoral, 0), 0.3);
        const teleopCoral = draw(ts.reduce((a, t) => a + g(t) * t.teleopCoral, 0), 0.25);
        const algae = draw(ts.reduce((a, t) => a + g(t) * t.algae, 0), 0.35);
        const foulPoints = draw(opp.reduce((a, k) => a + byKey.get(k)!.fouls, 0), 0.6);
        Object.assign(b, {
          autoMobilityPoints: leave,
          autoCoralPoints: autoCoral,
          teleopCoralPoints: teleopCoral,
          algaePoints: algae,
          endGameBargePoints: barge,
          foulPoints,
          adjustPoints: 0,
          totalPoints: leave + autoCoral + teleopCoral + algae + barge + foulPoints,
          autoBonusAchieved: leave === 9 && autoCoral >= 12,
          coralBonusAchieved: autoCoral + teleopCoral >= 70,
          bargeBonusAchieved: barge >= 14,
        });
        return b;
      };
      const rb = side(red, blue), bb = side(blue, red);
      const rs = rb.totalPoints as number, bs = bb.totalPoints as number;
      const winner = rs > bs ? 'red' : bs > rs ? 'blue' : 'tie';
      for (const [b, c] of [
        [rb, 'red'],
        [bb, 'blue'],
      ] as const) {
        const bonus = ['autoBonusAchieved', 'coralBonusAchieved', 'bargeBonusAchieved'].filter((k) => b[k]).length;
        b.rp = (winner === c ? 3 : winner === 'tie' ? 1 : 0) + bonus;
      }
      const time = base + mi * 420;
      matches.push({
        key: `${key}_qm${mi + 1}`,
        eventKey: key,
        year: 2025,
        compLevel: 'qm',
        setNumber: 1,
        matchNumber: mi + 1,
        red,
        blue,
        redScore: rs,
        blueScore: bs,
        winner,
        time,
        actualTime: time,
        predictedTime: null,
        postResultTime: time + 240,
        breakdown: { red: rb, blue: bb },
      });
    }
  }
  const data: SeasonData = { year: 2025, events, matches, eventTeams };
  return { data, teams };
}
