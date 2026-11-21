// SQLite storage (Node's built-in node:sqlite; no native dependency). One file holds the raw TBA cache,
// normalised season data and model outputs.

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Raw TBA responses with their ETags: lets incremental syncs send If-None-Match and keeps the app usable offline.
CREATE TABLE IF NOT EXISTS http_cache (
  path TEXT PRIMARY KEY,
  etag TEXT,
  body TEXT NOT NULL,
  max_age INTEGER NOT NULL DEFAULT 0,
  fetched_at INTEGER NOT NULL,   -- last time the body changed
  checked_at INTEGER NOT NULL    -- last time TBA confirmed it (200 or 304)
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY,
  year INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  ok INTEGER,
  requests INTEGER DEFAULT 0,
  not_modified INTEGER DEFAULT 0,
  cache_hits INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  changed INTEGER DEFAULT 0,
  message TEXT
);

CREATE TABLE IF NOT EXISTS events (
  key TEXT PRIMARY KEY,
  year INTEGER NOT NULL,
  name TEXT NOT NULL,
  short_name TEXT,
  event_type INTEGER NOT NULL,
  event_type_string TEXT,
  week INTEGER,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  city TEXT, state_prov TEXT, country TEXT,
  district_key TEXT, district_name TEXT,
  playoff_type INTEGER, playoff_type_string TEXT,
  parent_event_key TEXT,
  division_keys TEXT,
  timezone TEXT, website TEXT,
  synced_at INTEGER
);
CREATE INDEX IF NOT EXISTS events_year ON events(year, start_date);

CREATE TABLE IF NOT EXISTS teams (
  key TEXT PRIMARY KEY,
  number INTEGER NOT NULL,
  nickname TEXT, name TEXT,
  city TEXT, state_prov TEXT, country TEXT,
  rookie_year INTEGER
);
CREATE INDEX IF NOT EXISTS teams_number ON teams(number);

CREATE TABLE IF NOT EXISTS event_teams (
  event_key TEXT NOT NULL,
  team_key TEXT NOT NULL,
  PRIMARY KEY (event_key, team_key)
);
CREATE INDEX IF NOT EXISTS event_teams_team ON event_teams(team_key);

CREATE TABLE IF NOT EXISTS matches (
  key TEXT PRIMARY KEY,
  event_key TEXT NOT NULL,
  year INTEGER NOT NULL,
  comp_level TEXT NOT NULL,
  set_number INTEGER NOT NULL,
  match_number INTEGER NOT NULL,
  red TEXT NOT NULL, blue TEXT NOT NULL,              -- JSON arrays of team keys, station order
  red_surrogates TEXT, blue_surrogates TEXT, red_dq TEXT, blue_dq TEXT,
  red_score INTEGER, blue_score INTEGER,               -- NULL until played
  winner TEXT,                                         -- red | blue | tie | NULL
  time INTEGER, actual_time INTEGER, predicted_time INTEGER, post_result_time INTEGER,
  breakdown TEXT,                                      -- JSON {red, blue} or NULL
  videos TEXT
);
CREATE INDEX IF NOT EXISTS matches_event ON matches(event_key);
CREATE INDEX IF NOT EXISTS matches_year ON matches(year);

CREATE TABLE IF NOT EXISTS team_matches (
  team_key TEXT NOT NULL,
  match_key TEXT NOT NULL,
  year INTEGER NOT NULL,
  color TEXT NOT NULL,
  PRIMARY KEY (team_key, match_key)
);
CREATE INDEX IF NOT EXISTS team_matches_team_year ON team_matches(team_key, year);

-- Less-structured per-event resources kept as TBA JSON: rankings, alliances, awards.
CREATE TABLE IF NOT EXISTS event_resources (
  event_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  body TEXT,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (event_key, kind)
);

-- Model outputs. Every run is versioned; a season's current outputs are replaced atomically.
CREATE TABLE IF NOT EXISTS model_runs (
  id INTEGER PRIMARY KEY,
  year INTEGER NOT NULL,
  version TEXT NOT NULL,
  options TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER NOT NULL,
  data_as_of INTEGER NOT NULL,
  hyper TEXT NOT NULL,
  rules TEXT NOT NULL,
  quality TEXT NOT NULL,
  evaluated INTEGER NOT NULL,
  excluded TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS model_runs_year ON model_runs(year, id);

CREATE TABLE IF NOT EXISTS ratings (
  year INTEGER NOT NULL,
  team_key TEXT NOT NULL,
  run_id INTEGER NOT NULL,
  net REAL NOT NULL,
  rank INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (year, team_key)
);
CREATE INDEX IF NOT EXISTS ratings_rank ON ratings(year, rank);

CREATE TABLE IF NOT EXISTS team_event_ratings (
  event_key TEXT NOT NULL,
  team_key TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'latest',   -- latest | pre_playoff (frozen before the first playoff match)
  year INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (event_key, team_key, stage)
);

CREATE TABLE IF NOT EXISTS rating_history (
  year INTEGER NOT NULL,
  team_key TEXT NOT NULL,
  match_key TEXT NOT NULL,
  event_key TEXT NOT NULL,
  t INTEGER NOT NULL,
  mean REAL NOT NULL,
  sd REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS rating_history_team ON rating_history(team_key, year, t);

CREATE TABLE IF NOT EXISTS predictions (
  match_key TEXT PRIMARY KEY,
  year INTEGER NOT NULL,
  event_key TEXT NOT NULL,
  run_id INTEGER NOT NULL,
  kind TEXT NOT NULL,          -- pre_match (walk-forward, frozen at match start) | live (unplayed, latest data)
  cutoff INTEGER NOT NULL,     -- latest result time the forecast could see
  red_win_prob REAL NOT NULL,
  eligible INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS predictions_event ON predictions(event_key);

CREATE TABLE IF NOT EXISTS validation (
  year INTEGER NOT NULL,
  run_id INTEGER NOT NULL,
  model TEXT NOT NULL,
  label TEXT NOT NULL,
  split TEXT NOT NULL,
  metrics TEXT NOT NULL,
  PRIMARY KEY (year, model, split)
);
`;

let db: DatabaseSync | null = null;

export function dbPath() {
  return resolve(/*turbopackIgnore: true*/ process.env.OVERTIME_DB ?? 'data/overtime.db');
}

export function getDb(): DatabaseSync {
  if (db) return db;
  const path = dbPath();
  mkdirSync(dirname(path), { recursive: true });
  db = new DatabaseSync(path);
  // Derived-table migration: team_event_ratings gained a stage column; it is rebuilt by the next model run.
  const cols = db.prepare("SELECT name FROM pragma_table_info('team_event_ratings')").all() as { name: string }[];
  if (cols.length && !cols.some((c) => c.name === 'stage')) db.exec('DROP TABLE team_event_ratings');
  db.exec(SCHEMA);
  return db;
}

export function tx<T>(fn: () => T): T {
  const d = getDb();
  d.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    d.exec('COMMIT');
    return out;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}
