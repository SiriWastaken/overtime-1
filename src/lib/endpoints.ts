// Public API endpoint index (shared by the API root and the developer docs page).
export const ENDPOINTS = [
  ['GET /api/v1', 'This index'],
  ['GET /api/v1/seasons', 'Seasons with stored data'],
  ['GET /api/v1/seasons/{year}', 'Model run, season parameters, recovered rules, data freshness'],
  ['GET /api/v1/seasons/{year}/teams?q=&limit=&offset=', 'Team ratings, ranked'],
  ['GET /api/v1/seasons/{year}/validation', 'Walk-forward metrics for the model, baselines and ablations'],
  ['GET /api/v1/seasons/{year}/events', 'Events with status and match counts'],
  ['GET /api/v1/teams/{number}?year=', 'Team metadata, rating, events and rating history'],
  ['GET /api/v1/teams/{number}/matches?year=', 'Team matches with stored forecasts'],
  ['GET /api/v1/events/{key}', 'Event, team estimates at the event, TBA rankings, alliances and awards'],
  ['GET /api/v1/events/{key}/matches', 'Matches with forecasts (pre_match = frozen at start, live = latest)'],
  ['GET /api/v1/events/{key}/rankings', 'Projected qualification rankings (simulation)'],
  ['GET /api/v1/events/{key}/playoffs', 'Alliances, actual series and simulated bracket probabilities'],
  ['GET /api/v1/events/{key}/selection?captain=1', 'Pick values for a captain by simulated event-win probability'],
  ['GET /api/v1/matches/{key}', 'One match with its forecast'],
  ['GET /api/v1/predict?year=&red=254,1678,118&blue=1323,4414,2056[&event=]', 'Ad-hoc forecast for any two alliances'],
] as const;
