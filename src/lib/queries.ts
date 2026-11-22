// Read models for the UI and the public API. Everything comes from stored TBA data and stored model outputs;
// nothing is invented when data is missing (callers render explicit empty states).

import { seasonForm, TREND_SPAN } from './galaxy.ts';
import type { XptsForecast, TeamRating, TeamContribution, ComponentRating } from '../engine/model.ts';
import type { Metrics } from '../engine/metrics.ts';
import type { RuleFits } from '../engine/rules.ts';
import type { MatchRow } from '../engine/types.ts';
import { getDb } from './db.ts';
import { toMatch, type EventDbRow, type MatchDbRow } from './repo.ts';

const db = () => getDb();
const parse = <T>(s: string | null | undefined): T | null => (s ? (JSON.parse(s) as T) : null);

export interface TeamMeta {
  key: string;
  number: number;
  nickname: string | null;
  name: string | null;
  city: string | null;
  state_prov: string | null;
  country: string | null;
  rookie_year: number | null;
}

export interface ModelRunRow {
  id: number;
  year: number;
  version: string;
  options: Record<string, unknown>;
  started_at: number;
  finished_at: number;
  data_as_of: number;
  hyper: {
    components: Record<string, { n: number; mu: number; tau: number; sigma: number }>;
    totalNoiseSd: number;
    marginNoiseSd: number;
    noiseScaling?: { level: number; p: number; marginP: number };
    offset: number;
    rp: RuleFits['rp'];
    bonusProbModels: Record<string, number>;
  };
  rules: RuleFits;
  quality: { alliances: number; missingBreakdown: number; componentMismatch: number };
  evaluated: number;
  excluded: { notEligible: number; total: number };
}

export function seasons(): { year: number; events: number; matches: number; modelled: boolean }[] {
  return db()
    .prepare(
      `SELECT e.year, COUNT(*) events,
        (SELECT COUNT(*) FROM matches m WHERE m.year = e.year) matches,
        EXISTS(SELECT 1 FROM model_runs r WHERE r.year = e.year) modelled
       FROM events e GROUP BY e.year ORDER BY e.year DESC`
    )
    .all()
    .map((r) => ({ year: Number(r.year), events: Number(r.events), matches: Number(r.matches), modelled: Boolean(r.modelled) }));
}

/** Latest season that has model outputs (falls back to the latest synced season). */
export function defaultYear(): number | null {
  const s = seasons();
  return (s.find((x) => x.modelled) ?? s[0])?.year ?? null;
}

export function resolveYear(param: string | string[] | undefined): number | null {
  const y = Number(Array.isArray(param) ? param[0] : param);
  return Number.isInteger(y) && y > 1991 ? y : defaultYear();
}

export function modelRun(year: number): ModelRunRow | null {
  const r = db().prepare('SELECT * FROM model_runs WHERE year = ? ORDER BY id DESC LIMIT 1').get(year) as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    ...(r as unknown as ModelRunRow),
    options: JSON.parse(r.options as string),
    hyper: JSON.parse(r.hyper as string),
    rules: JSON.parse(r.rules as string),
    quality: JSON.parse(r.quality as string),
    excluded: JSON.parse(r.excluded as string),
  };
}

export function modelRunHistory(year: number) {
  return db().prepare('SELECT id, version, finished_at, data_as_of, evaluated FROM model_runs WHERE year = ? ORDER BY id DESC LIMIT 20').all(year) as {
    id: number;
    version: string;
    finished_at: number;
    data_as_of: number;
    evaluated: number;
  }[];
}

export interface Freshness {
  lastSync: { finished_at: number | null; ok: number | null; message: string | null; started_at: number } | null;
  lastSuccess: number | null;
  dataAsOf: number | null;
  tbaKeyConfigured: boolean;
}

export function freshness(year: number | null): Freshness {
  const lastSync = year
    ? ((db().prepare('SELECT started_at, finished_at, ok, message FROM sync_runs WHERE year = ? ORDER BY id DESC LIMIT 1').get(year) as Freshness['lastSync'] | undefined) ?? null)
    : null;
  const ok = year ? (db().prepare('SELECT MAX(finished_at) t FROM sync_runs WHERE year = ? AND ok = 1').get(year) as { t: number | null }) : { t: null };
  return { lastSync, lastSuccess: ok.t, dataAsOf: year ? (modelRun(year)?.data_as_of ?? null) : null, tbaKeyConfigured: Boolean(process.env.TBA_API_KEY) };
}

// ---------------------------------------------------------------- teams

export interface RatedTeam extends TeamMeta {
  rank: number;
  rating: TeamRating;
  percentile: number;
}

export function teamRatings(year: number, opts: { q?: string; limit?: number; offset?: number } = {}): { total: number; rows: RatedTeam[] } {
  const total = (db().prepare('SELECT COUNT(*) n FROM ratings WHERE year = ?').get(year) as { n: number }).n;
  const like = opts.q ? `%${opts.q.trim()}%` : null;
  const rows = db()
    .prepare(
      `SELECT r.rank, r.data, t.* FROM ratings r LEFT JOIN teams t ON t.key = r.team_key
       WHERE r.year = ? AND (? IS NULL OR CAST(t.number AS TEXT) LIKE ? OR t.nickname LIKE ? OR t.city LIKE ? OR t.state_prov LIKE ? OR t.country LIKE ?)
       ORDER BY r.rank LIMIT ? OFFSET ?`
    )
    .all(year, like, like, like, like, like, like, opts.limit ?? 10000, opts.offset ?? 0) as Record<string, unknown>[];
  return {
    total,
    rows: rows.map((r) => {
      const rating = JSON.parse(r.data as string) as TeamRating;
      return { ...(r as unknown as TeamMeta), key: rating.team, number: (r.number as number) ?? Number(rating.team.slice(3)), rank: r.rank as number, rating, percentile: 1 - ((r.rank as number) - 1) / Math.max(total, 1) };
    }),
  };
}

export function teamMeta(key: string): TeamMeta | null {
  return (db().prepare('SELECT * FROM teams WHERE key = ?').get(key) as TeamMeta | undefined) ?? null;
}

export function teamMetaMap(keys: string[]): Map<string, TeamMeta> {
  if (keys.length === 0) return new Map();
  const rows = db().prepare(`SELECT * FROM teams WHERE key IN (${keys.map(() => '?').join(',')})`).all(...keys) as unknown as TeamMeta[];
  return new Map(rows.map((r) => [r.key, r]));
}

export function teamRating(year: number, key: string): { rank: number; total: number; rating: TeamRating } | null {
  const r = db().prepare('SELECT rank, data FROM ratings WHERE year = ? AND team_key = ?').get(year, key) as { rank: number; data: string } | undefined;
  if (!r) return null;
  const total = (db().prepare('SELECT COUNT(*) n FROM ratings WHERE year = ?').get(year) as { n: number }).n;
  return { rank: r.rank, total, rating: JSON.parse(r.data) };
}

export function teamHistory(year: number, key: string) {
  return db().prepare('SELECT match_key, event_key, t, mean, sd FROM rating_history WHERE year = ? AND team_key = ? ORDER BY t').all(year, key) as {
    match_key: string;
    event_key: string;
    t: number;
    mean: number;
    sd: number;
  }[];
}

export function teamYears(key: string): number[] {
  return (db().prepare('SELECT DISTINCT year FROM team_matches WHERE team_key = ? ORDER BY year DESC').all(key) as { year: number }[]).map((r) => r.year);
}

export function teamEvents(year: number, key: string) {
  return (
    db()
      .prepare(
        `SELECT e.*, ter.data rating FROM event_teams et JOIN events e ON e.key = et.event_key
         LEFT JOIN team_event_ratings ter ON ter.event_key = e.key AND ter.team_key = et.team_key AND ter.stage = 'latest'
         WHERE et.team_key = ? AND e.year = ? ORDER BY e.start_date`
      )
      .all(key, year) as unknown as (EventDbRow & { rating: string | null })[]
  ).map((e) => ({ ...e, rating: parse<TeamContribution & { comps: Record<string, ComponentRating> }>(e.rating) }));
}

// ---------------------------------------------------------------- matches & predictions

export interface MatchWithPrediction extends MatchRow {
  prediction: { kind: 'pre_match' | 'live'; cutoff: number; eligible: boolean; forecast: XptsForecast } | null;
  surrogates: string[];
  dqs: string[];
  videos: { type: string; key: string }[];
}

const LEVEL = "CASE comp_level WHEN 'qm' THEN 0 WHEN 'ef' THEN 1 WHEN 'qf' THEN 2 WHEN 'sf' THEN 3 ELSE 4 END";

function withPred(rows: (MatchDbRow & { p_kind: string | null; p_cutoff: number | null; p_eligible: number | null; p_data: string | null })[]): MatchWithPrediction[] {
  return rows.map((r) => ({
    ...toMatch(r),
    surrogates: [...(parse<string[]>(r.red_surrogates) ?? []), ...(parse<string[]>(r.blue_surrogates) ?? [])],
    dqs: [...(parse<string[]>(r.red_dq) ?? []), ...(parse<string[]>(r.blue_dq) ?? [])],
    videos: parse(r.videos) ?? [],
    prediction: r.p_data ? { kind: r.p_kind as 'pre_match' | 'live', cutoff: r.p_cutoff!, eligible: Boolean(r.p_eligible), forecast: JSON.parse(r.p_data) } : null,
  }));
}

const PRED_COLS = 'p.kind p_kind, p.cutoff p_cutoff, p.eligible p_eligible, p.data p_data';

export function eventMatches(eventKey: string): MatchWithPrediction[] {
  return withPred(
    db().prepare(`SELECT m.*, ${PRED_COLS} FROM matches m LEFT JOIN predictions p ON p.match_key = m.key WHERE m.event_key = ? ORDER BY ${LEVEL}, set_number, match_number`).all(eventKey) as never
  );
}

export function match(key: string): MatchWithPrediction | null {
  return withPred(db().prepare(`SELECT m.*, ${PRED_COLS} FROM matches m LEFT JOIN predictions p ON p.match_key = m.key WHERE m.key = ?`).all(key) as never)[0] ?? null;
}

export function teamMatches(year: number, key: string): MatchWithPrediction[] {
  return withPred(
    db()
      .prepare(
        `SELECT m.*, ${PRED_COLS} FROM team_matches tm JOIN matches m ON m.key = tm.match_key LEFT JOIN predictions p ON p.match_key = m.key
         JOIN events e ON e.key = m.event_key WHERE tm.team_key = ? AND tm.year = ? ORDER BY e.start_date, m.event_key, ${LEVEL}, m.set_number, m.match_number`
      )
      .all(key, year) as never
  );
}

/** Recently completed and upcoming matches across the season (by time). */
export function recentMatches(year: number, which: 'completed' | 'upcoming', limit = 12): MatchWithPrediction[] {
  const sql =
    which === 'completed'
      ? `SELECT m.*, ${PRED_COLS} FROM matches m LEFT JOIN predictions p ON p.match_key = m.key WHERE m.year = ? AND m.red_score IS NOT NULL ORDER BY COALESCE(m.actual_time, m.time) DESC LIMIT ?`
      : `SELECT m.*, ${PRED_COLS} FROM matches m LEFT JOIN predictions p ON p.match_key = m.key WHERE m.year = ? AND m.red_score IS NULL ORDER BY COALESCE(m.predicted_time, m.time) ASC LIMIT ?`;
  return withPred(db().prepare(sql).all(year, limit) as never);
}

// ---------------------------------------------------------------- events

export type EventStatus = 'upcoming' | 'live' | 'completed';

export interface EventSummary extends EventDbRow {
  status: EventStatus;
  teams: number;
  played: number;
  scheduled: number;
}

const today = () => new Date().toISOString().slice(0, 10);

function status(e: EventDbRow, played: number, _scheduled: number): EventStatus {
  if (today() < e.start_date && played === 0) return 'upcoming';
  // Playoff matches only appear once scheduled, so "all matches played" is not a reliable end signal.
  if (today() > e.end_date) return 'completed';
  return 'live';
}

export function events(year: number): EventSummary[] {
  return (
    db()
      .prepare(
        `SELECT e.*, (SELECT COUNT(*) FROM event_teams et WHERE et.event_key = e.key) teams,
          (SELECT COUNT(*) FROM matches m WHERE m.event_key = e.key AND m.red_score IS NOT NULL) played,
          (SELECT COUNT(*) FROM matches m WHERE m.event_key = e.key) scheduled
         FROM events e WHERE e.year = ? ORDER BY e.start_date, e.name`
      )
      .all(year) as unknown as (EventDbRow & { teams: number; played: number; scheduled: number })[]
  ).map((e) => ({ ...e, status: status(e, e.played, e.scheduled) }));
}

export function event(key: string): EventSummary | null {
  const e = db()
    .prepare(
      `SELECT e.*, (SELECT COUNT(*) FROM event_teams et WHERE et.event_key = e.key) teams,
        (SELECT COUNT(*) FROM matches m WHERE m.event_key = e.key AND m.red_score IS NOT NULL) played,
        (SELECT COUNT(*) FROM matches m WHERE m.event_key = e.key) scheduled
       FROM events e WHERE e.key = ?`
    )
    .get(key) as (EventDbRow & { teams: number; played: number; scheduled: number }) | undefined;
  return e ? { ...e, status: status(e, e.played, e.scheduled) } : null;
}

export function eventResource<T>(eventKey: string, kind: 'rankings' | 'alliances' | 'awards'): { data: T | null; fetchedAt: number } | null {
  const r = db().prepare('SELECT body, fetched_at FROM event_resources WHERE event_key = ? AND kind = ?').get(eventKey, kind) as { body: string | null; fetched_at: number } | undefined;
  return r ? { data: parse<T>(r.body), fetchedAt: r.fetched_at } : null;
}

export function eventTeamRatings(eventKey: string, stage: 'latest' | 'pre_playoff' = 'latest'): Map<string, TeamContribution & { comps: Record<string, ComponentRating> }> {
  const rows = db().prepare('SELECT team_key, data FROM team_event_ratings WHERE event_key = ? AND stage = ?').all(eventKey, stage) as { team_key: string; data: string }[];
  return new Map(rows.map((r) => [r.team_key, JSON.parse(r.data)]));
}

export function eventTeamKeys(eventKey: string): string[] {
  return (db().prepare('SELECT team_key FROM event_teams WHERE event_key = ?').all(eventKey) as { team_key: string }[]).map((r) => r.team_key);
}

// ---------------------------------------------------------------- validation

export interface ValidationEntry {
  model: string;
  label: string;
  split: string;
  metrics: Metrics;
}

export function validation(year: number): ValidationEntry[] {
  return (db().prepare('SELECT model, label, split, metrics FROM validation WHERE year = ?').all(year) as { model: string; label: string; split: string; metrics: string }[]).map((r) => ({
    ...r,
    metrics: JSON.parse(r.metrics),
  }));
}

/** Per-event prediction accuracy of the main model (eligible pre-match forecasts only). */
export function eventAccuracy(eventKey: string) {
  const rows = db()
    .prepare(
      `SELECT p.red_win_prob p, m.winner FROM predictions p JOIN matches m ON m.key = p.match_key
       WHERE p.event_key = ? AND p.kind = 'pre_match' AND p.eligible = 1 AND m.winner IS NOT NULL`
    )
    .all(eventKey) as { p: number; winner: string }[];
  let correct = 0, decided = 0, brier = 0;
  for (const r of rows) {
    const y = r.winner === 'red' ? 1 : r.winner === 'blue' ? 0 : 0.5;
    brier += (r.p - y) ** 2;
    if (y !== 0.5) {
      decided++;
      if ((r.p > 0.5) === (y === 1)) correct++;
    }
  }
  return { n: rows.length, accuracy: decided ? correct / decided : null, brier: rows.length ? brier / rows.length : null };
}

// ---------------------------------------------------------------- discovery & analysis helpers

export interface TeamMover {
  key: string;
  number: number;
  nickname: string | null;
  city: string | null;
  state_prov: string | null;
  country: string | null;
  currentNet: number;
  initialNet: number;
  deltaNet: number;
  currentRank: number;
  matches: number;
}

/** Biggest movers: change in scoring over each team's last TREND_SPAN matches (one cached query, see seasonForm). */
export function biggestMovers(year: number, limit = 8): { gainers: TeamMover[]; decliners: TeamMover[] } {
  const form = seasonForm(year);
  const movers: TeamMover[] = [];
  for (const r of teamRatings(year).rows) {
    const f = form.get(r.key);
    if (!f || r.rating.matches < 2 * TREND_SPAN) continue; // need a full window before and inside the trend
    movers.push({
      key: r.key,
      number: r.number,
      nickname: r.nickname,
      city: r.city,
      state_prov: r.state_prov,
      country: r.country,
      currentNet: r.rating.net,
      initialNet: r.rating.net - f.delta,
      deltaNet: f.delta,
      currentRank: r.rank,
      matches: r.rating.matches,
    });
  }
  const up = [...movers].sort((a, b) => b.deltaNet - a.deltaNet);
  return { gainers: up.slice(0, limit), decliners: up.reverse().slice(0, limit) };
}

/** Live events first, then the most recently played. Rosters are read only for the events returned. */
export function activeOrFeaturedEvents(year: number, limit = 6): (EventSummary & { topRating: number; meanRating: number })[] {
  const evs = events(year);
  const live = evs.filter((e) => e.status === 'live');
  const recent = evs.filter((e) => e.status !== 'live' && e.played > 0).sort((a, b) => b.end_date.localeCompare(a.end_date));
  const chosen = [...live, ...recent].slice(0, limit);
  const net = new Map(teamRatings(year).rows.map((r) => [r.key, r.rating.net]));
  return chosen.map((e) => {
    const nets = eventTeamKeys(e.key).map((k) => net.get(k) ?? 0);
    return { ...e, topRating: nets.length ? Math.max(...nets) : 0, meanRating: nets.length ? nets.reduce((x, y) => x + y, 0) / nets.length : 0 };
  });
}

export function similarTeams(year: number, targetKey: string, limit = 5): RatedTeam[] {
  const { rows } = teamRatings(year);
  const target = rows.find((r) => r.key === targetKey);
  if (!target) return [];

  const getVector = (r: TeamRating) => {
    const comps = r.components;
    return [
      comps.auto?.mean ?? 0,
      comps.teleop?.mean ?? 0,
      comps.endgame?.mean ?? 0,
      r.defense?.mean ?? 0,
      r.fouls?.mean ?? 0,
    ];
  };

  const vTarget = getVector(target.rating);
  const scored = rows
    .filter((r) => r.key !== targetKey && r.rating.matches >= 6)
    .map((r) => {
      const v = getVector(r.rating);
      let distSq = 0;
      for (let i = 0; i < vTarget.length; i++) {
        distSq += (vTarget[i] - v[i]) ** 2;
      }
      return { team: r, dist: Math.sqrt(distSq) };
    });

  scored.sort((a, b) => a.dist - b.dist);
  return scored.slice(0, limit).map((s) => s.team);
}

export function searchIndex(year: number) {
  const { rows: teams } = teamRatings(year);
  const evs = events(year);
  return {
    year,
    teams: teams.map((t) => [t.number, t.nickname ?? '', t.city ?? '', t.rank]),
    events: evs.map((e) => [e.key, e.name, e.city ?? '', e.status]),
  };
}

/** Latest sync run per season, for the data-sources page. */
export function latestSyncs() {
  return db()
    .prepare(
      `SELECT s.* FROM sync_runs s JOIN (SELECT year, MAX(id) id FROM sync_runs GROUP BY year) l ON l.id = s.id ORDER BY s.year DESC`
    )
    .all() as {
    year: number;
    started_at: number;
    finished_at: number | null;
    ok: number | null;
    requests: number;
    not_modified: number;
    cache_hits: number;
    errors: number;
    changed: number;
    message: string | null;
  }[];
}
