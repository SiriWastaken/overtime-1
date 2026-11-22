// Reading normalised season data back out of SQLite for the engine.

import type { EventInfo, MatchRow, SeasonData } from '../engine/types.ts';
import { getDb } from './db.ts';

export interface MatchDbRow {
  key: string;
  event_key: string;
  year: number;
  comp_level: MatchRow['compLevel'];
  set_number: number;
  match_number: number;
  red: string;
  blue: string;
  red_surrogates: string | null;
  blue_surrogates: string | null;
  red_dq: string | null;
  blue_dq: string | null;
  red_score: number | null;
  blue_score: number | null;
  winner: MatchRow['winner'];
  time: number | null;
  actual_time: number | null;
  predicted_time: number | null;
  post_result_time: number | null;
  breakdown: string | null;
  videos: string | null;
}

export function toMatch(r: MatchDbRow): MatchRow {
  return {
    key: r.key,
    eventKey: r.event_key,
    year: r.year,
    compLevel: r.comp_level,
    setNumber: r.set_number,
    matchNumber: r.match_number,
    red: JSON.parse(r.red),
    blue: JSON.parse(r.blue),
    redScore: r.red_score,
    blueScore: r.blue_score,
    winner: r.winner,
    time: r.time,
    actualTime: r.actual_time,
    predictedTime: r.predicted_time,
    postResultTime: r.post_result_time,
    breakdown: r.breakdown ? JSON.parse(r.breakdown) : null,
  };
}

export interface EventDbRow {
  key: string;
  year: number;
  name: string;
  short_name: string | null;
  event_type: number;
  event_type_string: string | null;
  week: number | null;
  start_date: string;
  end_date: string;
  city: string | null;
  state_prov: string | null;
  country: string | null;
  district_key: string | null;
  district_name: string | null;
  playoff_type: number | null;
  playoff_type_string: string | null;
  parent_event_key: string | null;
  division_keys: string | null;
  timezone: string | null;
  website: string | null;
  synced_at: number | null;
}

export const toEvent = (e: EventDbRow): EventInfo => ({
  key: e.key,
  year: e.year,
  name: e.name,
  shortName: e.short_name,
  eventType: e.event_type,
  week: e.week,
  startDate: e.start_date,
  endDate: e.end_date,
  playoffType: e.playoff_type,
  parentEventKey: e.parent_event_key,
});

export function loadSeason(year: number): SeasonData {
  const db = getDb();
  const events = (db.prepare('SELECT * FROM events WHERE year = ? ORDER BY start_date').all(year) as unknown as EventDbRow[]).map(toEvent);
  const matches = (db.prepare('SELECT * FROM matches WHERE year = ?').all(year) as unknown as MatchDbRow[]).map(toMatch);
  const eventTeams = new Map<string, string[]>();
  for (const r of db.prepare('SELECT et.event_key, et.team_key FROM event_teams et JOIN events e ON e.key = et.event_key WHERE e.year = ?').all(year) as { event_key: string; team_key: string }[]) {
    const list = eventTeams.get(r.event_key) ?? [];
    list.push(r.team_key);
    eventTeams.set(r.event_key, list);
  }
  const priors = new Map<string, { priorNet?: number; isRookie?: boolean }>();
  try {
    const rookies = db.prepare('SELECT key, rookie_year FROM teams WHERE rookie_year = ?').all(year) as { key: string; rookie_year: number }[];
    for (const r of rookies) priors.set(r.key, { isRookie: true });
    const priorRatings = db.prepare('SELECT team_key, net FROM ratings WHERE year = ?').all(year - 1) as { team_key: string; net: number }[];
    if (priorRatings.length > 0) {
      const vals = priorRatings.map((x) => x.net);
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) || 1;
      for (const pr of priorRatings) {
        const cur = priors.get(pr.team_key) ?? {};
        priors.set(pr.team_key, { ...cur, priorNet: (pr.net - mean) / sd });
      }
    }
  } catch {
    // If tables don't exist yet or columns absent, priors stay empty
  }
  return { year, events, matches, eventTeams, priors };
}
