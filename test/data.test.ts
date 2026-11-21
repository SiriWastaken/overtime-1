// Data-layer tests: TBA client caching/retry behaviour (fetch is stubbed) and the store → model pipeline.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

const dir = mkdtempSync(join(tmpdir(), 'overtime-test-'));
process.env.OVERTIME_DB = join(dir, 'test.db');

const { getDb } = await import('../src/lib/db.ts');
const { TbaClient, TbaError, v } = await import('../src/lib/tba.ts');
const { writeMatches, needsRefresh } = await import('../src/lib/sync.ts');
const { runAndStore } = await import('../src/lib/pipeline.ts');
const { loadSeason } = await import('../src/lib/repo.ts');
const { syntheticSeason } = await import('./synthetic.ts');

const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
  rmSync(dir, { recursive: true, force: true });
});

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
function stub(h: Handler) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string> });
    return h(url, init);
  }) as typeof fetch;
  return calls;
}

describe('TBA client', () => {
  it('caches with ETag, revalidates with If-None-Match, honours max-age', async () => {
    let n = 0;
    const calls = stub((_u, init) => {
      n++;
      const inm = (init.headers as Record<string, string>)['If-None-Match'];
      if (inm === '"v1"') return new Response(null, { status: 304, headers: { 'cache-control': 'max-age=0' } });
      return new Response(JSON.stringify({ current_season: 2026 }), { status: 200, headers: { etag: '"v1"', 'cache-control': 'max-age=0' } });
    });
    const c = new TbaClient('k', 2, 0);
    const a = await c.get('/status', v.status);
    assert.equal(a.status, 'fresh');
    assert.equal(a.changed, true);
    const b = await c.get('/status', v.status);
    assert.equal(b.status, 'not_modified');
    assert.equal(b.data!.current_season, 2026);
    assert.equal(calls[1].headers['If-None-Match'], '"v1"');
    assert.equal(calls[0].headers['X-TBA-Auth-Key'], 'k');
    // With a positive max-age the network is skipped entirely.
    getDb().prepare("UPDATE http_cache SET max_age = 3600 WHERE path = '/status'").run();
    const c2 = await c.get('/status', v.status);
    assert.equal(c2.status, 'cache');
    assert.equal(n, 2);
  });

  it('deduplicates concurrent identical requests', async () => {
    let n = 0;
    stub(async () => {
      n++;
      await new Promise((r) => setTimeout(r, 20));
      return new Response('[]', { status: 200, headers: { etag: '"e"' } });
    });
    const c = new TbaClient('k', 4, 0);
    await Promise.all([c.get('/events/2031', v.events), c.get('/events/2031', v.events), c.get('/events/2031', v.events)]);
    assert.equal(n, 1);
  });

  it('retries 5xx and then succeeds', async () => {
    let n = 0;
    stub(() => (++n < 2 ? new Response('down', { status: 503 }) : new Response('[]', { status: 200 })));
    const r = await new TbaClient('k', 1, 2).get('/events/2032', v.events);
    assert.equal(r.status, 'fresh');
    assert.equal(n, 2);
  });

  it('serves stale cache when TBA is unreachable, and fails clearly without a cache', async () => {
    stub(() => {
      throw new TypeError('fetch failed');
    });
    const c = new TbaClient('k', 1, 0);
    getDb().prepare("UPDATE http_cache SET max_age = 0 WHERE path = '/status'").run();
    const r = await c.get('/status', v.status);
    assert.equal(r.status, 'stale');
    await assert.rejects(c.get('/events/1999', v.events));
  });

  it('rejects malformed bodies and bad keys without caching them', async () => {
    stub(() => new Response(JSON.stringify([{ nope: 1 }]), { status: 200 }));
    await assert.rejects(new TbaClient('k', 1, 0).get('/events/2033', v.events), (e: unknown) => e instanceof TbaError && e.status === 422);
    assert.equal(getDb().prepare("SELECT COUNT(*) n FROM http_cache WHERE path = '/events/2033'").get()!.n, 0);
    stub(() => new Response('', { status: 401 }));
    await assert.rejects(new TbaClient('bad', 1, 3).get('/events/2034', v.events), (e: unknown) => e instanceof TbaError && e.status === 401);
  });
});

describe('sync policy', () => {
  it('refreshes unsynced and recent events, skips long-finished ones', () => {
    const e = { start_date: '2025-03-06', end_date: '2025-03-08' };
    assert.equal(needsRefresh(e, null, '2025-11-01'), true);
    assert.equal(needsRefresh(e, Date.parse('2025-03-08T20:00:00Z') / 1000, '2025-11-01'), true);
    assert.equal(needsRefresh(e, Date.parse('2025-03-20T00:00:00Z') / 1000, '2025-11-01'), false);
  });
});

describe('store → model pipeline', () => {
  before(() => {
    const { data } = syntheticSeason(21, 120, 6, 40, 10);
    const db = getDb();
    for (const e of data.events) {
      db.prepare('INSERT INTO events (key, year, name, short_name, event_type, week, start_date, end_date, playoff_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(e.key, 2025, e.name, e.shortName, 0, e.week, e.startDate, e.endDate, 10);
      for (const t of data.eventTeams.get(e.key)!) db.prepare('INSERT OR IGNORE INTO event_teams VALUES (?, ?)').run(e.key, t);
    }
    // Write through the same TBA → row conversion the sync uses (TBA marks unplayed scores as -1).
    for (const e of data.events) {
      const ms = data.matches.filter((m) => m.eventKey === e.key);
      writeMatches(
        2025,
        e.key,
        ms.map((m, i) => {
          const unplayed = e.key === data.events.at(-1)!.key && i >= ms.length - 5;
          return {
            key: m.key, comp_level: m.compLevel, set_number: m.setNumber, match_number: m.matchNumber, event_key: m.eventKey,
            alliances: {
              red: { score: unplayed ? -1 : m.redScore!, team_keys: m.red, surrogate_team_keys: [], dq_team_keys: [] },
              blue: { score: unplayed ? -1 : m.blueScore!, team_keys: m.blue, surrogate_team_keys: [], dq_team_keys: [] },
            },
            winning_alliance: unplayed || m.winner === 'tie' ? '' : m.winner!,
            time: m.time, actual_time: unplayed ? null : m.actualTime, predicted_time: null, post_result_time: unplayed ? null : m.postResultTime,
            score_breakdown: unplayed ? null : m.breakdown, videos: [],
          };
        })
      );
    }
  });

  it('round-trips matches and stores ratings, forecasts and validation', () => {
    const season = loadSeason(2025);
    assert.equal(season.matches.filter((m) => m.redScore === null).length, 5);
    const out = runAndStore(2025)!;
    const db = getDb();
    const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
    assert.ok(count('SELECT COUNT(*) n FROM ratings WHERE year = 2025') > 100);
    assert.equal(count("SELECT COUNT(*) n FROM predictions WHERE kind = 'live'"), 5);
    assert.equal(count("SELECT COUNT(*) n FROM predictions WHERE kind = 'pre_match'"), season.matches.length - 5);
    assert.ok(count("SELECT COUNT(*) n FROM validation WHERE model = 'xpts' AND split = 'all'") === 1);
    // Pre-match cutoffs are always before the match started.
    const bad = db.prepare("SELECT p.match_key FROM predictions p JOIN matches m ON m.key = p.match_key WHERE p.kind = 'pre_match' AND p.cutoff >= m.actual_time").all();
    assert.deepEqual(bad, []);
    assert.ok(out.runId > 0);
  });
});
