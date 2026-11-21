import Link from 'next/link';
import { NoData, Empty } from '@/components/bits';
import { LineScore } from '@/components/LineScore';
import { RatingsTable } from '@/components/RatingsTable';
import { seasonSpec } from '@/engine/seasons';
import { dateRange, pct, pts } from '@/lib/format';
import { events, modelRun, recentMatches, resolveYear, teamRatings, validation } from '@/lib/queries';

export default async function Overview({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const year = resolveYear((await searchParams).year);
  const run = year ? modelRun(year) : null;
  if (!year || !run)
    return (
      <>
        <div className="page-head">
          <div>
            <h1>{year ?? ''} Season</h1>
          </div>
        </div>
        <NoData year={year} />
      </>
    );
  const spec = seasonSpec(year);
  const { total, rows } = teamRatings(year, { limit: 25 });
  const evs = events(year).filter((e) => [0, 1, 2, 3, 4, 5].includes(e.event_type));
  const live = evs.filter((e) => e.status === 'live');
  const recentEvents = evs.filter((e) => e.status === 'completed').slice(-8).reverse();
  const upcoming = recentMatches(year, 'upcoming', 6);
  const completed = recentMatches(year, 'completed', 6);
  const val = validation(year).filter((v) => v.split === 'all');
  const main = val.find((v) => v.model === 'xpts');
  const baselines = val.filter((v) => !v.model.startsWith('xpts'));
  const best = baselines.sort((a, b) => a.metrics.logLoss - b.metrics.logLoss)[0];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            {year} {spec.game}
          </h1>
          <div className="sub">Ratings use only {year} matches. Every forecast below was frozen before its match began.</div>
        </div>
        <div className="facts">
          <div className="fact">
            <b>{total}</b>
            <small>teams rated</small>
          </div>
          <div className="fact">
            <b>{run.excluded.total.toLocaleString()}</b>
            <small>matches played</small>
          </div>
          {main ? (
            <div className="fact">
              <b>{pct(main.metrics.accuracy)}</b>
              <small>favourite won</small>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid-2">
        <section className="section">
          <div className="section-head">
            <h2>Top teams</h2>
            <span className="note">xPts = expected net points per match</span>
            <Link className="more" href={`/teams?year=${year}`}>
              All {total} teams
            </Link>
          </div>
          <RatingsTable year={year} rows={rows} compact />
        </section>

        <div>
          <section className="section">
            <div className="section-head">
              <h2>{upcoming.length ? 'Next up' : 'Latest results'}</h2>
            </div>
            {(upcoming.length ? upcoming : completed).slice(0, 4).map((m) => (
              <LineScore key={m.key} m={m} year={year} />
            ))}
            {upcoming.length === 0 && completed.length === 0 ? <Empty>No matches stored for {year}.</Empty> : null}
          </section>

          {main ? (
            <section className="section">
              <div className="section-head">
                <h2>Forecast record</h2>
                <Link className="more" href={`/analytics?year=${year}`}>
                  Full validation
                </Link>
              </div>
              <table className="agate">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th className="n">Matches</th>
                    <th className="n">Favourite won</th>
                    <th className="n" title="Lower is better">
                      Brier
                    </th>
                    <th className="n" title="Lower is better">
                      Log loss
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[main, best].filter(Boolean).map((v) => (
                    <tr key={v!.model}>
                      <td className={v!.model === 'xpts' ? 'strong' : ''}>{v!.label}</td>
                      <td className="n">{v!.metrics.n.toLocaleString()}</td>
                      <td className="n">{pct(v!.metrics.accuracy)}</td>
                      <td className="n">{v!.metrics.brier.toFixed(3)}</td>
                      <td className="n">{v!.metrics.logLoss.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Walk-forward: each forecast used only results public before the match started. Best baseline shown on the same matches.
              </p>
            </section>
          ) : null}
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>{live.length ? 'Events in progress' : 'Recent events'}</h2>
          <Link className="more" href={`/events?year=${year}`}>
            All events
          </Link>
        </div>
        {(live.length ? live : recentEvents).length ? (
          <table className="agate">
            <thead>
              <tr>
                <th>Event</th>
                <th className="hide-m">Dates</th>
                <th className="n">Teams</th>
                <th className="n">Matches played</th>
              </tr>
            </thead>
            <tbody>
              {(live.length ? live : recentEvents).map((e) => (
                <tr key={e.key}>
                  <td>
                    <Link href={`/events/${e.key}`}>{e.name}</Link>
                  </td>
                  <td className="hide-m muted">{dateRange(e.start_date, e.end_date)}</td>
                  <td className="n">{e.teams}</td>
                  <td className="n">
                    {e.played}
                    <span className="muted"> / {e.scheduled}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No completed or live official events yet.</Empty>
        )}
      </section>
      <p className="muted" style={{ fontSize: 12 }}>
        Season noise: a single alliance score varies by about ±{pts(run.hyper.totalNoiseSd, 0)} points (1 SD) around its forecast.
      </p>
    </>
  );
}
