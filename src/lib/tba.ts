// The Blue Alliance API v3 client.
// - Persistent cache in SQLite keyed by path, revalidated with ETag / If-None-Match (304s are cheap).
// - Honours TBA's Cache-Control max-age before hitting the network at all.
// - Deduplicates identical in-flight requests and caps concurrency.
// - Retries 429 / 5xx / network errors with exponential backoff (respecting Retry-After).
// - When TBA is unreachable, serves the cached body and reports it as stale instead of failing.

import { getDb } from './db.ts';

const BASE = 'https://www.thebluealliance.com/api/v3';

export type FetchStatus = 'fresh' | 'not_modified' | 'cache' | 'stale';

export interface TbaResult<T> {
  data: T | null;
  status: FetchStatus;
  /** True when the body differs from what was cached before this call. */
  changed: boolean;
  fetchedAt: number;
}

export class TbaError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface TbaStats {
  requests: number;
  notModified: number;
  cacheHits: number;
  errors: number;
  stale: number;
}

interface CacheRow {
  etag: string | null;
  body: string;
  max_age: number;
  fetched_at: number;
  checked_at: number;
}

const now = () => Math.floor(Date.now() / 1000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class TbaClient {
  readonly stats: TbaStats = { requests: 0, notModified: 0, cacheHits: 0, errors: 0, stale: 0 };
  private readonly key: string | undefined;
  private readonly inflight = new Map<string, Promise<TbaResult<unknown>>>();
  private active = 0;
  private readonly queue: (() => void)[] = [];
  private readonly concurrency: number;
  private readonly retries: number;

  constructor(key = process.env.TBA_API_KEY, concurrency = 6, retries = 4) {
    this.key = key || undefined;
    this.concurrency = concurrency;
    this.retries = retries;
  }

  get hasKey() {
    return this.key !== undefined;
  }

  /**
   * GET a TBA path. `validate` rejects malformed bodies (they are never cached).
   * `force` skips the max-age shortcut but still revalidates with the ETag.
   */
  get<T>(path: string, validate: (x: unknown) => x is T, opts: { force?: boolean } = {}): Promise<TbaResult<T>> {
    const k = `${path}|${opts.force ? 1 : 0}`;
    let p = this.inflight.get(k) as Promise<TbaResult<T>> | undefined;
    if (!p) {
      p = this.load(path, validate, opts.force ?? false).finally(() => this.inflight.delete(k));
      this.inflight.set(k, p);
    }
    return p;
  }

  private async load<T>(path: string, validate: (x: unknown) => x is T, force: boolean): Promise<TbaResult<T>> {
    const db = getDb();
    const cached = db.prepare('SELECT etag, body, max_age, fetched_at, checked_at FROM http_cache WHERE path = ?').get(path) as CacheRow | undefined;
    const fromCache = (status: FetchStatus): TbaResult<T> => ({ data: JSON.parse(cached!.body) as T, status, changed: false, fetchedAt: cached!.fetched_at });
    if (cached && !force && now() - cached.checked_at < cached.max_age) {
      this.stats.cacheHits++;
      return fromCache('cache');
    }
    if (!this.key) {
      if (cached) {
        this.stats.stale++;
        return fromCache('stale');
      }
      throw new TbaError('TBA_API_KEY is not set and no cached copy exists', 0);
    }

    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (attempt > 0) await sleep(Math.min(30000, 500 * 2 ** attempt) * (0.75 + Math.random() * 0.5));
      try {
        const res = await this.limited(() =>
          fetch(`${BASE}${path}`, {
            headers: { 'X-TBA-Auth-Key': this.key!, Accept: 'application/json', ...(cached?.etag ? { 'If-None-Match': cached.etag } : {}) },
            signal: AbortSignal.timeout(20000),
          })
        );
        this.stats.requests++;
        const maxAge = parseMaxAge(res.headers.get('cache-control'));
        if (res.status === 304 && cached) {
          this.stats.notModified++;
          db.prepare('UPDATE http_cache SET checked_at = ?, max_age = ? WHERE path = ?').run(now(), maxAge, path);
          return fromCache('not_modified');
        }
        if (res.status === 401 || res.status === 403) throw new TbaError(`TBA rejected the API key (${res.status})`, res.status);
        if (res.status === 404) return { data: null, status: 'fresh', changed: false, fetchedAt: now() };
        if (res.status === 429 || res.status >= 500) {
          const ra = Number(res.headers.get('retry-after'));
          if (ra > 0) await sleep(Math.min(ra, 60) * 1000);
          lastErr = new TbaError(`TBA ${res.status} for ${path}`, res.status);
          continue;
        }
        if (!res.ok) throw new TbaError(`TBA ${res.status} for ${path}`, res.status);
        const text = await res.text();
        const json: unknown = JSON.parse(text);
        if (json !== null && !validate(json)) throw new TbaError(`Unexpected response shape for ${path}`, 422);
        const changed = cached?.body !== text;
        db.prepare(
          `INSERT INTO http_cache (path, etag, body, max_age, fetched_at, checked_at) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(path) DO UPDATE SET etag = excluded.etag, body = excluded.body, max_age = excluded.max_age,
             fetched_at = CASE WHEN http_cache.body = excluded.body THEN http_cache.fetched_at ELSE excluded.fetched_at END,
             checked_at = excluded.checked_at`
        ).run(path, res.headers.get('etag'), text, maxAge, now(), now());
        return { data: json as T | null, status: 'fresh', changed, fetchedAt: now() };
      } catch (e) {
        if (e instanceof TbaError && (e.status === 401 || e.status === 403 || e.status === 422)) throw e;
        lastErr = e;
      }
    }
    this.stats.errors++;
    if (cached) {
      this.stats.stale++;
      return fromCache('stale');
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  private async limited<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) await new Promise<void>((r) => this.queue.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

function parseMaxAge(h: string | null): number {
  const m = h?.match(/max-age=(\d+)/);
  return m ? Number(m[1]) : 60;
}

// ---------------------------------------------------------------- response shapes (only fields we use)

export interface TbaStatus {
  current_season: number;
  max_season: number;
  is_datafeed_down: boolean;
  down_events: string[];
}

export interface TbaEvent {
  key: string;
  name: string;
  short_name: string | null;
  event_type: number;
  event_type_string: string;
  week: number | null;
  start_date: string;
  end_date: string;
  year: number;
  city: string | null;
  state_prov: string | null;
  country: string | null;
  district: { key: string; display_name: string } | null;
  playoff_type: number | null;
  playoff_type_string: string | null;
  parent_event_key: string | null;
  division_keys: string[];
  timezone: string | null;
  website: string | null;
}

export interface TbaTeam {
  key: string;
  team_number: number;
  nickname: string | null;
  name: string | null;
  city: string | null;
  state_prov: string | null;
  country: string | null;
  rookie_year: number | null;
}

export interface TbaMatchAlliance {
  score: number;
  team_keys: string[];
  surrogate_team_keys: string[];
  dq_team_keys: string[];
}

export interface TbaMatch {
  key: string;
  comp_level: 'pm' | 'qm' | 'ef' | 'qf' | 'sf' | 'f';
  set_number: number;
  match_number: number;
  alliances: { red: TbaMatchAlliance; blue: TbaMatchAlliance };
  winning_alliance: 'red' | 'blue' | '';
  event_key: string;
  time: number | null;
  actual_time: number | null;
  predicted_time: number | null;
  post_result_time: number | null;
  score_breakdown: { red: Record<string, unknown>; blue: Record<string, unknown> } | null;
  videos: { type: string; key: string }[];
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown) => typeof x === 'string';

export const v = {
  status: (x: unknown): x is TbaStatus => isObj(x) && typeof x.current_season === 'number',
  events: (x: unknown): x is TbaEvent[] => Array.isArray(x) && x.every((e) => isObj(e) && isStr(e.key) && typeof e.event_type === 'number' && isStr(e.start_date)),
  teams: (x: unknown): x is TbaTeam[] => Array.isArray(x) && x.every((t) => isObj(t) && isStr(t.key) && typeof t.team_number === 'number'),
  matches: (x: unknown): x is TbaMatch[] =>
    Array.isArray(x) &&
    x.every((m) => isObj(m) && isStr(m.key) && isStr(m.comp_level) && isObj(m.alliances) && isObj(m.alliances.red) && Array.isArray((m.alliances.red as Record<string, unknown>).team_keys)),
  any: (x: unknown): x is unknown => true,
};
