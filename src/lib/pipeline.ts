// Run the season model on stored data and persist its outputs atomically (one versioned run per season).

import { runSeason, type SeasonRun } from '../engine/season.ts';
import type { ModelOptions } from '../engine/model.ts';
import { getDb, tx } from './db.ts';
import { loadSeason } from './repo.ts';

export function runAndStore(year: number, opts: Partial<ModelOptions> = {}): { run: SeasonRun; runId: number } | null {
  const started = Math.floor(Date.now() / 1000);
  const data = loadSeason(year);
  if (data.matches.length === 0) return null;
  const run = runSeason(data, opts);
  const m = run.model;
  const db = getDb();
  const runId = tx(() => {
    const id = Number(
      db
        .prepare('INSERT INTO model_runs (year, version, options, started_at, finished_at, data_as_of, hyper, rules, quality, evaluated, excluded) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(year, run.version, JSON.stringify(run.options), started, Math.floor(Date.now() / 1000), m.dataAsOf, JSON.stringify(m.hyperSnapshot()), JSON.stringify(m.rules), JSON.stringify(m.quality), run.evaluated, JSON.stringify(run.excluded))
        .lastInsertRowid
    );
    for (const t of ['ratings', 'rating_history', 'predictions', 'validation']) db.prepare(`DELETE FROM ${t} WHERE year = ?`).run(year);
    db.prepare('DELETE FROM team_event_ratings WHERE year = ?').run(year);

    const rating = db.prepare('INSERT INTO ratings (year, team_key, run_id, net, rank, data) VALUES (?, ?, ?, ?, ?, ?)');
    m.ratings().forEach((r, i) => rating.run(year, r.team, id, r.net, i + 1, JSON.stringify(r)));

    const ter = db.prepare('INSERT INTO team_event_ratings (event_key, team_key, stage, year, data) VALUES (?, ?, ?, ?, ?)');
    for (const e of data.events) for (const [team, r] of m.eventRatings(e.key)) ter.run(e.key, team, 'latest', year, JSON.stringify(r));
    for (const [ek, snap] of m.prePlayoff) for (const [team, r] of snap) ter.run(ek, team, 'pre_playoff', year, JSON.stringify(r));

    const hist = db.prepare('INSERT INTO rating_history (year, team_key, match_key, event_key, t, mean, sd) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const h of m.history) hist.run(year, h.team, h.matchKey, h.eventKey, h.t, h.mean, h.sd);

    const pred = db.prepare('INSERT INTO predictions (match_key, year, event_key, run_id, kind, cutoff, red_win_prob, eligible, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const f of run.forecasts) pred.run(f.matchKey, year, f.eventKey, id, f.kind, f.cutoff, f.forecast.redWinProb, f.forecast.eligible ? 1 : 0, JSON.stringify(f.forecast));

    const val = db.prepare('INSERT INTO validation (year, run_id, model, label, split, metrics) VALUES (?, ?, ?, ?, ?, ?)');
    for (const v of run.validation) val.run(year, id, v.model, v.label, v.split, JSON.stringify(v.metrics));
    return id;
  });
  return { run, runId };
}
