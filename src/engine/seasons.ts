// Per-season scoring specifications.
//
// A season spec says how an alliance's score decomposes into components and who is credited with each one.
// It deliberately contains NO performance data (no baselines, no priors from earlier seasons): only which
// score-breakdown fields exist and how they are attributed. Point values of per-robot categorical fields
// (e.g. "DeepCage") are not hard-coded either; they are recovered from the season's own breakdowns
// (see rules.ts), because they are fixed game rules that the breakdowns encode exactly.

import type { Breakdown } from './types.ts';

export type Phase = 'auto' | 'teleop' | 'endgame' | 'fouls';

export interface ComponentSpec {
  id: string;
  label: string;
  phase: Phase;
  /**
   * alliance: points scored jointly by the alliance; credit is inferred across the three robots.
   * robot:    points earned by a specific robot, observed directly from per-robot breakdown fields.
   * opponent: points this alliance received because of the *opponents'* fouls; charged to the opponents.
   */
  attribution: 'alliance' | 'robot' | 'opponent';
  /** Alliance-level points for this component (for robot components: the total the robots' categories sum to). */
  points: (b: Breakdown | null, score: number) => number | null;
  /** Robot components: the per-robot categorical field for station 1..3. */
  robotField?: (station: number) => string;
  /** Whether opposing robots may suppress this component (estimated only when the defense option is enabled). */
  defendable?: boolean;
}

export interface BonusSpec {
  key: string;
  label: string;
  /** Components whose predicted alliance points drive this bonus. */
  features: string[];
}

export interface SeasonSpec {
  year: number;
  game: string;
  components: ComponentSpec[];
  bonuses: BonusSpec[];
  /** True when we only know the total score (no game-specific decomposition). */
  generic: boolean;
}

/** Read a numeric field, supporting dotted paths into nested objects. Missing → null. */
export function num(b: Breakdown | null, path: string): number | null {
  if (!b) return null;
  let cur: unknown = b;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'number' && Number.isFinite(cur) ? cur : null;
}

const sum =
  (...paths: string[]) =>
  (b: Breakdown | null) => {
    let s = 0;
    for (const p of paths) {
      const v = num(b, p);
      if (v === null) return null;
      s += v;
    }
    return s;
  };

const robot = (prefix: string) => (station: number) => `${prefix}${station}`;
const fouls: ComponentSpec = { id: 'fouls', label: 'Foul points conceded', phase: 'fouls', attribution: 'opponent', points: sum('foulPoints') };

const SPECS: Record<number, Omit<SeasonSpec, 'year' | 'generic'>> = {
  2026: {
    game: 'REBUILT',
    components: [
      { id: 'auto_fuel', label: 'Auto fuel', phase: 'auto', attribution: 'alliance', points: sum('hubScore.autoPoints') },
      { id: 'auto_tower', label: 'Auto tower', phase: 'auto', attribution: 'robot', points: sum('autoTowerPoints'), robotField: robot('autoTowerRobot') },
      {
        id: 'teleop_fuel',
        label: 'Teleop fuel',
        phase: 'teleop',
        attribution: 'alliance',
        defendable: true,
        points: (b) => {
          const t = num(b, 'hubScore.totalPoints');
          const a = num(b, 'hubScore.autoPoints');
          return t === null || a === null ? null : t - a;
        },
      },
      { id: 'endgame_tower', label: 'Endgame tower', phase: 'endgame', attribution: 'robot', points: sum('endGameTowerPoints'), robotField: robot('endGameTowerRobot') },
      fouls,
    ],
    bonuses: [
      { key: 'energizedAchieved', label: 'Energized', features: ['auto_fuel', 'teleop_fuel'] },
      { key: 'superchargedAchieved', label: 'Supercharged', features: ['auto_fuel', 'teleop_fuel'] },
      { key: 'traversalAchieved', label: 'Traversal', features: ['auto_tower', 'endgame_tower'] },
    ],
  },
  2025: {
    game: 'REEFSCAPE',
    components: [
      { id: 'auto_leave', label: 'Auto leave', phase: 'auto', attribution: 'robot', points: sum('autoMobilityPoints'), robotField: robot('autoLineRobot') },
      { id: 'auto_coral', label: 'Auto coral', phase: 'auto', attribution: 'alliance', points: sum('autoCoralPoints') },
      { id: 'teleop_coral', label: 'Teleop coral', phase: 'teleop', attribution: 'alliance', defendable: true, points: sum('teleopCoralPoints') },
      { id: 'algae', label: 'Algae', phase: 'teleop', attribution: 'alliance', defendable: true, points: sum('algaePoints') },
      { id: 'barge', label: 'Barge', phase: 'endgame', attribution: 'robot', points: sum('endGameBargePoints'), robotField: robot('endGameRobot') },
      fouls,
    ],
    bonuses: [
      { key: 'autoBonusAchieved', label: 'Auto', features: ['auto_leave', 'auto_coral'] },
      { key: 'coralBonusAchieved', label: 'Coral', features: ['auto_coral', 'teleop_coral'] },
      { key: 'bargeBonusAchieved', label: 'Barge', features: ['barge'] },
    ],
  },
  2024: {
    game: 'CRESCENDO',
    components: [
      { id: 'auto_leave', label: 'Auto leave', phase: 'auto', attribution: 'robot', points: sum('autoLeavePoints'), robotField: robot('autoLineRobot') },
      { id: 'auto_notes', label: 'Auto notes', phase: 'auto', attribution: 'alliance', points: sum('autoTotalNotePoints') },
      { id: 'teleop_notes', label: 'Teleop notes', phase: 'teleop', attribution: 'alliance', defendable: true, points: sum('teleopTotalNotePoints') },
      { id: 'stage', label: 'Onstage / park', phase: 'endgame', attribution: 'robot', points: sum('endGameOnStagePoints', 'endGameParkPoints'), robotField: robot('endGameRobot') },
      { id: 'stage_bonus', label: 'Harmony, trap, spotlight', phase: 'endgame', attribution: 'alliance', points: sum('endGameHarmonyPoints', 'endGameNoteInTrapPoints', 'endGameSpotLightBonusPoints') },
      fouls,
    ],
    bonuses: [
      { key: 'melodyBonusAchieved', label: 'Melody', features: ['auto_notes', 'teleop_notes'] },
      { key: 'ensembleBonusAchieved', label: 'Ensemble', features: ['stage', 'stage_bonus'] },
    ],
  },
  2023: {
    game: 'CHARGED UP',
    components: [
      { id: 'auto_mobility', label: 'Auto mobility', phase: 'auto', attribution: 'robot', points: sum('autoMobilityPoints'), robotField: robot('mobilityRobot') },
      { id: 'auto_pieces', label: 'Auto game pieces', phase: 'auto', attribution: 'alliance', points: sum('autoGamePiecePoints') },
      { id: 'auto_charge', label: 'Auto charge station', phase: 'auto', attribution: 'alliance', points: sum('autoChargeStationPoints') },
      { id: 'teleop_pieces', label: 'Teleop game pieces', phase: 'teleop', attribution: 'alliance', defendable: true, points: sum('teleopGamePiecePoints') },
      { id: 'links', label: 'Links', phase: 'teleop', attribution: 'alliance', points: sum('linkPoints') },
      { id: 'endgame_charge', label: 'Endgame charge / park', phase: 'endgame', attribution: 'alliance', points: sum('endGameChargeStationPoints', 'endGameParkPoints') },
      fouls,
    ],
    bonuses: [
      { key: 'sustainabilityBonusAchieved', label: 'Sustainability', features: ['links', 'auto_pieces', 'teleop_pieces'] },
      { key: 'activationBonusAchieved', label: 'Activation', features: ['auto_charge', 'endgame_charge'] },
    ],
  },
};

/** Fallback for seasons without a game-specific spec: non-foul score plus fouls when the breakdown has them. */
function genericSpec(year: number): SeasonSpec {
  return {
    year,
    game: `FRC ${year}`,
    generic: true,
    bonuses: [],
    components: [
      {
        id: 'scoring',
        label: 'Scoring (non-foul)',
        phase: 'teleop',
        attribution: 'alliance',
        defendable: true,
        points: (b, score) => score - (num(b, 'foulPoints') ?? 0),
      },
      { ...fouls },
    ],
  };
}

/** Total-score-only spec, used by the transparent regression baselines. */
export function totalOnlySpec(year: number): SeasonSpec {
  return {
    year,
    game: `FRC ${year}`,
    generic: true,
    bonuses: [],
    components: [{ id: 'total', label: 'Total score', phase: 'teleop', attribution: 'alliance', points: (_b, score) => score }],
  };
}

export function seasonSpec(year: number): SeasonSpec {
  const s = SPECS[year];
  return s ? { year, generic: false, ...s } : genericSpec(year);
}

export const SUPPORTED_GAME_YEARS = Object.keys(SPECS).map(Number);
