// Season synchronisation from TBA into SQLite. Discovers every event of a season automatically; refreshes only
// events that can still change (not yet synced after they ended), so repeated syncs are cheap.

import { OFFICIAL_EVENT_TYPES } from '../engine/types.ts';
import { getDb, tx } from './db.ts';
import { TbaClient, v, type TbaEvent, type TbaMatch, type TbaStatus, type TbaTeam } from './tba.ts';

export interface SyncReport {
  year: number;
  events: number;
  refreshed: number;
  changed: boolean;
  stale: boolean;
  errors: string[];
  stats: TbaClient['stats'];
}

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);

/** An event needs refreshing until it has been synced at least three days after it ended. */
export function needsRefresh(e: { start_date: string; end_date: string }, syncedAt: number | null, now = today()): boolean {
  if (syncedAt === null) return true;
  if (now < addDays(e.start_date, -2)) return false; // future event: registrations only; checked by the season list
  const syncedDay = new Date(syncedAt * 1000).toISOString().slice(0, 10);
  return syncedDay <= addDays(e.end_date, 3);
}

export async function syncSeason(year: number, opts: { full?: boolean; client?: TbaClient; log?: (s: string) => void } = {}): Promise<SyncReport> {
  const client = opts.client ?? new TbaClient();
  const log = opts.log ?? (() => {});
  const db = getDb();
  const started = Math.floor(Date.now() / 1000);
  const runId = Number(db.prepare('INSERT INTO sync_runs (year, started_at) VALUES (?, ?)').run(year, started).lastInsertRowid);
  const errors: string[] = [];
  let changed = false;
  let stale = false;
  let refreshed = 0;

  try {
    const status = await client.get<TbaStatus>('/status', v.status);
    if (status.data?.down_events?.length) log(`TBA reports ${status.data.down_events.length} event(s) not updating`);
    const evRes = await client.get<TbaEvent[]>(`/events/${year}`, v.events, { force: opts.full });
    stale ||= evRes.status === 'stale';
    changed ||= evRes.changed;
    const events = evRes.data ?? [];
    upsertEvents(events);
    const synced = new Map((db.prepare('SELECT key, synced_at FROM events WHERE year = ?').all(year) as { key: string; synced_at: number | null }[]).map((r) => [r.key, r.synced_at]));
    const todo = events.filter((e) => OFFICIAL_EVENT_TYPES.has(e.event_type) && (opts.full || needsRefresh(e, synced.get(e.key) ?? null)));
    log(`${events.length} events in ${year}; refreshing ${todo.length}`);

    await Promise.all(
      todo.map(async (e) => {
        try {
          const [matches, teams, rankings, alliances, awards] = await Promise.all([
            client.get<TbaMatch[]>(`/event/${e.key}/matches`, v.matches, { force: opts.full }),
            client.get<TbaTeam[]>(`/event/${e.key}/teams`, v.teams, { force: opts.full }),
            client.get<unknown>(`/event/${e.key}/rankings`, v.any, { force: opts.full }),
            client.get<unknown>(`/event/${e.key}/alliances`, v.any, { force: opts.full }),
            client.get<unknown>(`/event/${e.key}/awards`, v.any, { force: opts.full }),
          ]);
          const all = [matches, teams, rankings, alliances, awards];
          stale ||= all.some((r) => r.status === 'stale');
          if (all.some((r) => r.changed)) changed = true;
          tx(() => {
            writeTeams(e.key, teams.data ?? []);
            writeMatches(year, e.key, matches.data ?? []);
            const put = db.prepare('INSERT OR REPLACE INTO event_resources (event_key, kind, body, fetched_at) VALUES (?, ?, ?, ?)');
            put.run(e.key, 'rankings', JSON.stringify(rankings.data), rankings.fetchedAt);
            put.run(e.key, 'alliances', JSON.stringify(alliances.data), alliances.fetchedAt);
            put.run(e.key, 'awards', JSON.stringify(awards.data), awards.fetchedAt);
            // Only mark as synced when the data is genuinely fresh, so stale fallbacks are retried next time.
            if (!all.some((r) => r.status === 'stale')) db.prepare('UPDATE events SET synced_at = ? WHERE key = ?').run(Math.floor(Date.now() / 1000), e.key);
          });
          refreshed++;
        } catch (err) {
          errors.push(`${e.key}: ${(err as Error).message}`);
        }
      })
    );
  } catch (err) {
    errors.push((err as Error).message);
  }

  const s = client.stats;
  db.prepare('UPDATE sync_runs SET finished_at = ?, ok = ?, requests = ?, not_modified = ?, cache_hits = ?, errors = ?, changed = ?, message = ? WHERE id = ?').run(
    Math.floor(Date.now() / 1000),
    errors.length === 0 && !stale ? 1 : 0,
    s.requests,
    s.notModified,
    s.cacheHits,
    s.errors + errors.length,
    changed ? 1 : 0,
    errors.slice(0, 20).join('\n') || (stale ? 'TBA unreachable; cached data used' : null),
    runId
  );
  const events = (db.prepare('SELECT COUNT(*) n FROM events WHERE year = ?').get(year) as { n: number }).n;
  return { year, events, refreshed, changed, stale, errors, stats: { ...s } };
}

function upsertEvents(events: TbaEvent[]) {
  const db = getDb();
  const st = db.prepare(`
    INSERT INTO events (key, year, name, short_name, event_type, event_type_string, week, start_date, end_date, city, state_prov, country,
      district_key, district_name, playoff_type, playoff_type_string, parent_event_key, division_keys, timezone, website)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET name = excluded.name, short_name = excluded.short_name, event_type = excluded.event_type,
      event_type_string = excluded.event_type_string, week = excluded.week, start_date = excluded.start_date, end_date = excluded.end_date,
      city = excluded.city, state_prov = excluded.state_prov, country = excluded.country, district_key = excluded.district_key,
      district_name = excluded.district_name, playoff_type = excluded.playoff_type, playoff_type_string = excluded.playoff_type_string,
      parent_event_key = excluded.parent_event_key, division_keys = excluded.division_keys, timezone = excluded.timezone, website = excluded.website`);
  tx(() => {
    for (const e of events)
      st.run(
        e.key, e.year, e.name, e.short_name, e.event_type, e.event_type_string, e.week, e.start_date, e.end_date, e.city, e.state_prov, e.country,
        e.district?.key ?? null, e.district?.display_name ?? null, e.playoff_type, e.playoff_type_string, e.parent_event_key, JSON.stringify(e.division_keys ?? []), e.timezone, e.website
      );
  });
}

function writeTeams(eventKey: string, teams: TbaTeam[]) {
  const db = getDb();
  const up = db.prepare(`INSERT INTO teams (key, number, nickname, name, city, state_prov, country, rookie_year) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET nickname = excluded.nickname, name = excluded.name, city = excluded.city, state_prov = excluded.state_prov,
      country = excluded.country, rookie_year = excluded.rookie_year`);
  db.prepare('DELETE FROM event_teams WHERE event_key = ?').run(eventKey);
  const et = db.prepare('INSERT OR IGNORE INTO event_teams (event_key, team_key) VALUES (?, ?)');
  for (const t of teams) {
    up.run(t.key, t.team_number, t.nickname, t.name, t.city, t.state_prov, t.country, t.rookie_year);
    et.run(eventKey, t.key);
  }
}

/** Store matches. Practice matches are excluded by TBA's /matches; a score of -1 means unplayed → NULL. */
export function writeMatches(year: number, eventKey: string, matches: TbaMatch[]) {
  const db = getDb();
  const keep = matches.filter((m) => m.comp_level !== 'pm');
  const existing = db.prepare('SELECT key FROM matches WHERE event_key = ?').all(eventKey) as { key: string }[];
  const keys = new Set(keep.map((m) => m.key));
  const del = db.prepare('DELETE FROM matches WHERE key = ?');
  const delTm = db.prepare('DELETE FROM team_matches WHERE match_key = ?');
  for (const { key } of existing)
    if (!keys.has(key)) {
      del.run(key);
      delTm.run(key);
    }
  const st = db.prepare(`INSERT OR REPLACE INTO matches (key, event_key, year, comp_level, set_number, match_number, red, blue, red_surrogates, blue_surrogates,
    red_dq, blue_dq, red_score, blue_score, winner, time, actual_time, predicted_time, post_result_time, breakdown, videos)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const tm = db.prepare('INSERT OR REPLACE INTO team_matches (team_key, match_key, year, color) VALUES (?, ?, ?, ?)');
  for (const m of keep) {
    const r = m.alliances.red;
    const b = m.alliances.blue;
    const isPlayed = r.score >= 0 && b.score >= 0;
    const winner = !isPlayed ? null : m.winning_alliance === '' ? (r.score === b.score ? 'tie' : r.score > b.score ? 'red' : 'blue') : m.winning_alliance;
    st.run(
      m.key, eventKey, year, m.comp_level, m.set_number, m.match_number, JSON.stringify(r.team_keys), JSON.stringify(b.team_keys),
      JSON.stringify(r.surrogate_team_keys ?? []), JSON.stringify(b.surrogate_team_keys ?? []), JSON.stringify(r.dq_team_keys ?? []), JSON.stringify(b.dq_team_keys ?? []),
      isPlayed ? r.score : null, isPlayed ? b.score : null, winner, m.time, m.actual_time, m.predicted_time, m.post_result_time,
      m.score_breakdown ? JSON.stringify(m.score_breakdown) : null, JSON.stringify(m.videos ?? [])
    );
    for (const t of r.team_keys) tm.run(t, m.key, year, 'red');
    for (const t of b.team_keys) tm.run(t, m.key, year, 'blue');
  }
}
