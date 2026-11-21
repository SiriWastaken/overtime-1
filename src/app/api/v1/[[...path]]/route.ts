// Public, unauthenticated JSON API. Every response is built from the same stored data the site shows.

import { MODEL_VERSION } from '@/engine/model';
import { ENDPOINTS } from '@/lib/endpoints';
import { seasonSpec } from '@/engine/seasons';
import { seasonEdges } from '@/lib/edge';
import { adHocForecast, playoffAnalysis, rankingAnalysis, selectionAnalysis } from '@/lib/analysis';
import {
  defaultYear,
  event,
  eventMatches,
  eventResource,
  eventTeamRatings,
  events,
  freshness,
  match,
  modelRun,
  seasons,
  teamEvents,
  teamHistory,
  teamMatches,
  teamMeta,
  teamRating,
  teamRatings,
  validation,
} from '@/lib/queries';

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const ok = (data: unknown) => Response.json(data, { headers: HEADERS });
const need = <T>(x: T | null | undefined, what: string): T => {
  if (x === null || x === undefined) throw new HttpError(404, `${what} not found`);
  return x;
};
const yearOf = (s: string | null | undefined) => {
  const y = Number(s);
  if (!Number.isInteger(y) || y < 1992 || y > 2100) throw new HttpError(400, 'year must be a four-digit season, e.g. 2026');
  return y;
};
const teamKey = (s: string) => {
  const n = s.replace(/^frc/i, '');
  if (!/^\d{1,5}$/.test(n)) throw new HttpError(400, `invalid team "${s}"`);
  return `frc${n}`;
};
const list = (s: string | null) => (s ?? '').split(',').filter(Boolean).map(teamKey);
const eventKeyOk = (k: string) => {
  if (!/^\d{4}[a-z0-9]+$/.test(k)) throw new HttpError(400, 'invalid event key');
  return k;
};


function route(parts: string[], q: URLSearchParams): unknown {
  const [a, b, c] = parts;
  if (!a)
    return {
      name: 'Overtime 1 public API',
      version: 'v1',
      model: MODEL_VERSION,
      auth: 'none',
      notes: 'Ratings are season-isolated. Probabilities are model outputs, not official results. Source data: The Blue Alliance.',
      endpoints: ENDPOINTS.map(([path, description]) => ({ path, description })),
    };
  if (a === 'seasons') {
    if (!b) return seasons();
    const year = yearOf(b);
    if (!c) {
      const run = need(modelRun(year), `model run for ${year}`);
      const spec = seasonSpec(year);
      return { year, game: spec.game, components: spec.components.map(({ id, label, phase, attribution }) => ({ id, label, phase, attribution })), run, freshness: freshness(year) };
    }
    if (c === 'teams') {
      const limit = Math.min(Number(q.get('limit')) || 100, 5000);
      const offset = Math.max(Number(q.get('offset')) || 0, 0);
      const r = teamRatings(year, { q: q.get('q') ?? undefined, limit, offset });
      return { year, total: r.total, limit, offset, teams: r.rows.map(({ key, number, nickname, rank, percentile, rating }) => ({ key, number, nickname, rank, percentile, rating })) };
    }
    if (c === 'edge') {
      const s = need(seasonEdges(year), `EDGE for ${year}`);
      const limit = Math.min(Number(q.get('limit')) || 100, 5000);
      const offset = Math.max(Number(q.get('offset')) || 0, 0);
      return {
        year,
        run: s.runId,
        units: 'win probability (0.10 = +10 percentage points)',
        baseline: { kind: 'median rated robot', net: s.ctx.replacement, poolSize: s.ctx.poolSize },
        total: s.ranked.length,
        limit,
        offset,
        teams: s.ranked.slice(offset, offset + limit),
      };
    }
    if (c === 'validation') return { year, run: modelRun(year)?.id ?? null, rows: validation(year) };
    if (c === 'events') return events(year);
  }
  if (a === 'teams' && b) {
    const key = teamKey(b);
    const year = yearOf(q.get('year') ?? String(defaultYear()));
    if (c === 'matches') return teamMatches(year, key);
    const meta = teamMeta(key);
    const rating = teamRating(year, key);
    if (!meta && !rating) throw new HttpError(404, 'team not found');
    return { team: meta, year, rating, edge: seasonEdges(year)?.byTeam.get(key) ?? null, events: teamEvents(year, key), history: teamHistory(year, key) };
  }
  if (a === 'events' && b) {
    const key = eventKeyOk(b);
    const ev = need(event(key), 'event');
    if (!c)
      return {
        event: ev,
        teams: Object.fromEntries(eventTeamRatings(key)),
        rankings: eventResource(key, 'rankings')?.data ?? null,
        alliances: eventResource(key, 'alliances')?.data ?? null,
        awards: eventResource(key, 'awards')?.data ?? null,
      };
    if (c === 'matches') return eventMatches(key);
    if (c === 'rankings') {
      const r = need(rankingAnalysis(key), 'ranking projection');
      return { remaining: r.remaining, official: Object.fromEntries(r.official), projected: r.rows };
    }
    if (c === 'playoffs') return need(playoffAnalysis(key), 'playoff analysis');
    if (c === 'selection') {
      const r = selectionAnalysis(key, Number(q.get('captain')) || 1);
      if ('error' in r) throw new HttpError(422, r.error);
      return r;
    }
  }
  if (a === 'search') {
    const year = yearOf(q.get('year') ?? String(defaultYear()));
    const term = (q.get('q') ?? '').trim().slice(0, 60);
    if (!term) return { year, q: term, teams: [], events: [] };
    const num = term.replace(/^frc/i, '');
    const edges = seasonEdges(year)?.byTeam;
    const hits = teamRatings(year, { q: num, limit: 40 }).rows;
    // Exact team number first, then number prefixes, then everything else by season rank.
    const score = (n: number) => (String(n) === num ? 0 : String(n).startsWith(num) ? 1 : 2);
    hits.sort((x, y) => score(x.number) - score(y.number) || x.rank - y.rank);
    const low = term.toLowerCase();
    const evs = events(year)
      .filter((e) => `${e.name} ${e.short_name ?? ''} ${e.city ?? ''} ${e.key}`.toLowerCase().includes(low))
      .slice(0, 4)
      .map((e) => ({ key: e.key, name: e.name, status: e.status, start: e.start_date }));
    return {
      year,
      q: term,
      teams: hits.slice(0, 7).map((t) => ({ key: t.key, number: t.number, nickname: t.nickname, rank: edges?.get(t.key)?.rank ?? t.rank, edge: edges?.get(t.key)?.edge ?? null })),
      events: evs,
    };
  }
  if (a === 'matches' && b) return need(match(b), 'match');
  if (a === 'predict') {
    const year = yearOf(q.get('year'));
    const red = list(q.get('red'));
    const blue = list(q.get('blue'));
    if (red.length < 1 || blue.length < 1 || red.length > 4 || blue.length > 4) throw new HttpError(400, 'red and blue must each list 1–4 team numbers');
    const ev = q.get('event');
    const r = need(adHocForecast(year, red, blue, ev ? eventKeyOk(ev) : undefined), `model run for ${year}`);
    if ('error' in r) throw new HttpError(404, r.error!);
    return { year, red, blue, ...r };
  }
  throw new HttpError(404, 'unknown endpoint; see /api/v1');
}

export async function GET(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  try {
    const { path = [] } = await ctx.params;
    return ok(route(path, new URL(req.url).searchParams));
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const message = e instanceof HttpError ? e.message : 'internal error';
    if (status === 500) console.error(e);
    return Response.json({ error: message, status }, { status, headers: { ...HEADERS, 'Cache-Control': 'no-store' } });
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: HEADERS });
}
