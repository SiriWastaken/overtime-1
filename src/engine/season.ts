// Run one season end to end: walk-forward forecasts for every played match, evaluation of the model and the
// baselines on an identical match set, and the final state used for live forecasts of unplayed matches.

import { EloEpa, SeasonAverage, TeamAverage } from './baselines.ts';
import { evaluate, type Metrics } from './metrics.ts';
import { DEFAULT_OPTIONS, MODEL_VERSION, XptsModel, type ModelOptions, type XptsForecast } from './model.ts';
import { walkForward, type Forecast, type Predictor } from './predictor.ts';
import { totalOnlySpec } from './seasons.ts';
import type { MatchRow, SeasonData } from './types.ts';
import { OFFICIAL_EVENT_TYPES, isPlayoff } from './types.ts';

export interface StoredForecast {
  matchKey: string;
  eventKey: string;
  kind: 'pre_match' | 'live';
  cutoff: number;
  forecast: XptsForecast;
}

export interface ValidationRow {
  model: string;
  label: string;
  split: string;
  metrics: Metrics;
}

export interface SeasonRun {
  version: string;
  options: ModelOptions;
  model: XptsModel;
  forecasts: StoredForecast[];
  validation: ValidationRow[];
  evaluated: number;
  excluded: { notEligible: number; total: number };
}

/**
 * Restrict to official events (off-season events use modified rules, B-teams and demo team numbers) and to
 * matches with two real alliances (TBA occasionally lists a playoff match with an empty alliance).
 */
export function officialOnly(data: SeasonData): SeasonData {
  const events = data.events.filter((e) => OFFICIAL_EVENT_TYPES.has(e.eventType));
  const keys = new Set(events.map((e) => e.key));
  return { ...data, events, matches: data.matches.filter((m) => keys.has(m.eventKey) && m.red.length > 0 && m.blue.length > 0) };
}

export function runSeason(raw: SeasonData, opts: Partial<ModelOptions> = {}, withAblations = true): SeasonRun {
  const data = officialOnly(raw);
  const options = { ...DEFAULT_OPTIONS, ...opts };
  const eventStart = new Map(data.events.map((e) => [e.key, e.startDate]));
  const startOf = (k: string) => eventStart.get(k) ?? `${data.year}-01-01`;

  const main = new XptsModel(data, options);
  const predictors: Predictor[] = [
    main,
    new SeasonAverage(),
    new TeamAverage(),
    new EloEpa(),
    new XptsModel(data, { ...options, carry: true, drift: false, eta: 0, q: 0, defense: false }, totalOnlySpec(data.year), 'season_opr', 'Season ridge OPR (total score)'),
    new XptsModel(data, { ...options, carry: false, eta: 0, q: 0, defense: false }, totalOnlySpec(data.year), 'event_opr', 'Event-only ridge OPR (total score)'),
  ];
  if (withAblations) {
    predictors.push(new XptsModel(data, { ...options, defense: !options.defense }, undefined, options.defense ? 'xpts_nodef' : 'xpts_def', options.defense ? 'xPts without defense' : 'xPts with defense term'));
    predictors.push(new XptsModel(data, { ...options, drift: false, eta: 0, q: 0 }, undefined, 'xpts_static', 'xPts, static (no drift / process noise)'));
  }

  const wf = walkForward(data.matches, predictors, startOf);
  const mainF = wf.forecasts.get(main.id)! as Map<string, XptsForecast>;

  const forecasts: StoredForecast[] = [];
  for (const m of wf.order) {
    const f = mainF.get(m.key);
    if (f) forecasts.push({ matchKey: m.key, eventKey: m.eventKey, kind: 'pre_match', cutoff: f.cutoff, forecast: f });
  }
  // Live forecasts for unplayed matches use everything known now.
  for (const m of wf.unplayed) {
    const f = main.predict(m, main.dataAsOf);
    forecasts.push({ matchKey: m.key, eventKey: m.eventKey, kind: 'live', cutoff: main.dataAsOf, forecast: f });
  }
  for (const e of data.events) main.touchEvent(e.key);

  // Identical evaluation set for every predictor: matches where the main model was informed and all predictors forecast.
  const evalSet = wf.order.filter((m) => mainF.get(m.key)?.eligible && predictors.every((p) => wf.forecasts.get(p.id)!.has(m.key)));
  const week = new Map(data.events.map((e) => [e.key, e.eventType === 3 || e.eventType === 4 ? 'Championship' : e.week === null ? 'Other' : `Week ${e.week + 1}`]));
  const splits: [string, (m: MatchRow) => boolean][] = [
    ['all', () => true],
    ['qual', (m) => !isPlayoff(m)],
    ['playoff', isPlayoff],
  ];
  for (const w of [...new Set(week.values())].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) splits.push([w, (m) => week.get(m.eventKey) === w]);

  const validation: ValidationRow[] = [];
  for (const p of predictors) {
    const fm = wf.forecasts.get(p.id)! as Map<string, Forecast>;
    for (const [split, pick] of splits) {
      const pairs = evalSet.filter(pick).map((m) => ({ m, f: fm.get(m.key)! }));
      if (pairs.length) validation.push({ model: p.id, label: p.label, split, metrics: evaluate(pairs) });
    }
  }

  return {
    version: MODEL_VERSION,
    options,
    model: main,
    forecasts,
    validation,
    evaluated: evalSet.length,
    excluded: { notEligible: wf.order.length - evalSet.length, total: wf.order.length },
  };
}
