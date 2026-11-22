// Domain types shared by the engine, the database layer and the UI.

export type CompLevel = 'qm' | 'ef' | 'qf' | 'sf' | 'f';
export type Color = 'red' | 'blue';
export type Breakdown = Record<string, unknown>;

export interface MatchRow {
  key: string;
  eventKey: string;
  year: number;
  compLevel: CompLevel;
  setNumber: number;
  matchNumber: number;
  red: string[];
  blue: string[];
  /** null when the match has not been played (TBA reports -1). */
  redScore: number | null;
  blueScore: number | null;
  winner: Color | 'tie' | null;
  time: number | null;
  actualTime: number | null;
  predictedTime: number | null;
  postResultTime: number | null;
  breakdown: { red: Breakdown; blue: Breakdown } | null;
}

export interface EventInfo {
  key: string;
  year: number;
  name: string;
  shortName: string | null;
  eventType: number;
  week: number | null;
  startDate: string;
  endDate: string;
  playoffType: number | null;
  parentEventKey: string | null;
}

export interface SeasonData {
  year: number;
  events: EventInfo[];
  matches: MatchRow[];
  /** Registered teams per event (from TBA /event/{key}/teams). */
  eventTeams: Map<string, string[]>;
  /** Prior season ratings and rookie indicators for Bayesian priors */
  priors?: Map<string, { priorNet?: number; isRookie?: boolean }>;
}

export const played = (m: MatchRow) => m.redScore !== null && m.blueScore !== null;
export const isPlayoff = (m: MatchRow) => m.compLevel !== 'qm';

/** Official FRC event types that use the season's rules: regional, district, DCMP, CMP division/finals, DCMP division. */
export const OFFICIAL_EVENT_TYPES = new Set([0, 1, 2, 3, 4, 5]);
