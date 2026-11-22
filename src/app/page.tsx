import Link from 'next/link';
import { HomeFunSandbox } from '@/components/HomeFunSandbox';
import { Tip, Why, UncertaintyFuzzBar } from '@/components/ui';
import { Avatar } from '@/components/bits';
import { seasonSpec } from '@/engine/seasons';
import { dateRange, location, matchLabel, pct, pts } from '@/lib/format';
import {
  activeOrFeaturedEvents,
  biggestMovers,
  defaultYear,
  modelRun,
  recentMatches,
  resolveYear,
  teamRatings,
} from '@/lib/queries';

export const metadata = {
  title: 'Overtime 1 · FRC Stats, Verified Models & Data',
  description: 'Fast, beautiful FRC stats and predictive modeling. Ridge regression, Bayesian shrinkage, Monte Carlo simulations, and open walk-forward backtests.',
};

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const year = resolveYear(sp.year) ?? defaultYear() ?? 2026;
  const run = modelRun(year);
  const spec = seasonSpec(year);

  // Queries
  const { total, rows: topTeams } = teamRatings(year, { limit: 10 });
  const featuredEvents = activeOrFeaturedEvents(year, 4);
  const { gainers, decliners } = biggestMovers(year, 6);
  const recentPlayed = recentMatches(year, 'completed', 1);
  const modelOfTheDayMatch = recentPlayed[0] ?? null;

  return (
    <div className="home-container">
      {/* Search-First Hero */}
      <section className="hero-search-section">
        <div className="hero-badge">
          <span className="live-dot" />
          <span>{year} Season · {spec.game} · {total.toLocaleString()} Rated Teams</span>
        </div>
        <h1 className="hero-title">
          FRC analytics, verified models, zero fluff.
        </h1>
        <p className="hero-sub">
          Expected contribution (xPts), Bayesian shrinkage, Monte Carlo draft and bracket simulations. Every number has a why.
        </p>

        <form action="/teams" method="GET" className="hero-search-form" role="search">
          <input type="hidden" name="year" value={year} />
          <div className="hero-input-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              name="q"
              placeholder="Search team number, name, event code, or city... (e.g. 1690, Cheesy, Silicon Valley)"
              autoComplete="off"
              className="hero-search-input"
            />
            <button type="submit" className="button primary hero-search-btn">
              Explore
            </button>
          </div>
        </form>

        <div className="hero-quick-chips">
          <span className="muted">Quick jump:</span>
          {topTeams.slice(0, 5).map((t) => (
            <Link key={t.key} href={`/teams/${t.number}?year=${year}`} className="chip-link">
              #{t.number} {t.nickname ?? ''}
            </Link>
          ))}
          <Link href={`/compare?year=${year}`} className="chip-link ghost">
            ⇄ Compare teams
          </Link>
          <Link href={`/lab?year=${year}`} className="chip-link ghost">
            ⚡ Lab &amp; Simulator
          </Link>
        </div>
      </section>

      {/* Featured / Live Events */}
      <section className="section" aria-labelledby="home-events-head">
        <div className="section-head">
          <div>
            <h2 id="home-events-head">Active &amp; Featured Events</h2>
            <p className="sub">Live simulation of final rankings, match schedules, and frozen predictions.</p>
          </div>
          <Link href={`/events?year=${year}`} className="button ghost">
            All {year} Events →
          </Link>
        </div>

        <div className="events-grid">
          {featuredEvents.map((ev) => (
            <Link key={ev.key} href={`/events/${ev.key}?year=${year}`} className="event-card">
              <div className="event-card-top">
                <span className={`status-pill ${ev.status}`}>{ev.status.toUpperCase()}</span>
                <span className="event-date muted">{dateRange(ev.start_date, ev.end_date)}</span>
              </div>
              <h3 className="event-card-title">{ev.name}</h3>
              <div className="event-card-meta muted">
                <span>{location(ev)}</span>
                {ev.district_name ? <span> · {ev.district_name}</span> : null}
              </div>
              <div className="event-card-stats">
                <div className="stat-unit">
                  <span className="stat-val">{ev.teams}</span>
                  <span className="stat-lbl">teams</span>
                </div>
                <div className="stat-unit">
                  <span className="stat-val">{ev.played}/{ev.scheduled}</span>
                  <span className="stat-lbl">matches</span>
                </div>
                <div className="stat-unit">
                  <span className="stat-val">{ev.topRating > 0 ? `+${ev.topRating.toFixed(1)}` : '—'}</span>
                  <span className="stat-lbl">top xPts</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Signature Interactive Element: Monte Carlo Rain Sandbox */}
      <HomeFunSandbox year={year} />

      {/* Two-Column: Biggest Movers + Model of the Day */}
      <div className="home-grid-columns">
        {/* Biggest Movers */}
        <section className="section mover-section" aria-labelledby="movers-head">
          <div className="section-head">
            <div>
              <h2 id="movers-head">Biggest Movers</h2>
              <p className="sub">Teams with the largest in-season rating climb.</p>
            </div>
            <Why
              title="Rating Movement (Delta Net)"
              method="Evaluates the change in posterior net contribution from early season event posteriors to current standing. Measures adaptation and mechanical iteration."
              inputs={['Rating history timeline', 'Bayesian carry drift', 'Match innovations']}
            />
          </div>

          <div className="table-wrap">
            <table className="agate">
              <thead>
                <tr>
                  <th>Team</th>
                  <th className="n">Rank</th>
                  <th className="n">xPts</th>
                  <th className="n">Season Gain</th>
                </tr>
              </thead>
              <tbody>
                {gainers.slice(0, 5).map((m) => (
                  <tr key={m.key}>
                    <td>
                      <Link href={`/teams/${m.number}?year=${year}`} className="team-link">
                        <Avatar team={m.number} year={year} size={20} />
                        <span className="strong">{m.number}</span>
                        <span className="muted hide-s">{m.nickname ?? ''}</span>
                      </Link>
                    </td>
                    <td className="n">#{m.currentRank}</td>
                    <td className="n">+{m.currentNet.toFixed(1)}</td>
                    <td className="n pos strong">+{m.deltaNet.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Model of the Day */}
        <section className="section model-of-day-section" aria-labelledby="motd-head">
          <div className="section-head">
            <div>
              <h2 id="motd-head">Model of the Day</h2>
              <p className="sub">Frozen pre-match forecast vs reality.</p>
            </div>
            {modelOfTheDayMatch?.prediction?.forecast ? (
              <Why
                title="Frozen Match Forecast"
                value={`${(modelOfTheDayMatch.prediction.forecast.redWinProb * 100).toFixed(0)}% Red Win`}
                method="Forecast frozen at match start using exact GaussianState prior to kickoff. Evaluates additive components, defense suppression, and heteroscedastic noise."
                inputs={[
                  `Red Alliance: ${modelOfTheDayMatch.red.join(', ')}`,
                  `Blue Alliance: ${modelOfTheDayMatch.blue.join(', ')}`,
                  `Predicted margin: ${modelOfTheDayMatch.prediction.forecast.margin.toFixed(1)} pts`,
                ]}
              />
            ) : null}
          </div>

          {modelOfTheDayMatch && modelOfTheDayMatch.prediction?.forecast ? (
            <div className="motd-card">
              <div className="motd-head">
                <span className="motd-label">MATCH SPOTLIGHT</span>
                <Link href={`/matches/${modelOfTheDayMatch.key}`} className="motd-link">
                  {matchLabel(modelOfTheDayMatch)} at {modelOfTheDayMatch.eventKey} →
                </Link>
              </div>

              <div className="motd-scoreboard">
                <div className={`motd-side red${modelOfTheDayMatch.winner === 'red' ? ' winner' : ''}`}>
                  <span className="side-tag">RED ALLIANCE</span>
                  <div className="side-teams">
                    {modelOfTheDayMatch.red.map((t) => (
                      <span key={t}>{t.slice(3)}</span>
                    ))}
                  </div>
                  <div className="side-score-box">
                    <span className="pred-score">Pred: {modelOfTheDayMatch.prediction.forecast.red.mean.toFixed(0)}</span>
                    <span className="actual-score">{modelOfTheDayMatch.redScore ?? '—'}</span>
                  </div>
                </div>

                <div className="motd-vs">
                  <span className="vs-winprob">
                    {(modelOfTheDayMatch.prediction.forecast.redWinProb * 100).toFixed(0)}%
                  </span>
                  <span className="muted vs-text">win prob</span>
                </div>

                <div className={`motd-side blue${modelOfTheDayMatch.winner === 'blue' ? ' winner' : ''}`}>
                  <span className="side-tag">BLUE ALLIANCE</span>
                  <div className="side-teams">
                    {modelOfTheDayMatch.blue.map((t) => (
                      <span key={t}>{t.slice(3)}</span>
                    ))}
                  </div>
                  <div className="side-score-box">
                    <span className="pred-score">Pred: {modelOfTheDayMatch.prediction.forecast.blue.mean.toFixed(0)}</span>
                    <span className="actual-score">{modelOfTheDayMatch.blueScore ?? '—'}</span>
                  </div>
                </div>
              </div>

              <div className="motd-insight">
                <strong>What the model saw:</strong> Red held an advantage of{' '}
                {Math.abs(modelOfTheDayMatch.prediction.forecast.margin).toFixed(1)} expected points.
                {modelOfTheDayMatch.winner ? (
                  <span>
                    {' '}Result:{' '}
                    <strong>{modelOfTheDayMatch.winner.toUpperCase()}</strong> won ({modelOfTheDayMatch.redScore}–{modelOfTheDayMatch.blueScore}).
                  </span>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="empty-panel">
              <span className="muted">No featured match with frozen forecast available for this season yet.</span>
            </div>
          )}
        </section>
      </div>

      {/* Verified Model Highlights */}
      <section className="section trust-section">
        <div className="trust-grid">
          <div className="trust-card">
            <h3>Verified Walk-Forward</h3>
            <p className="muted">
              Over 52,000 matches scored with frozen pre-match cutoff timestamps. No future leakage.
            </p>
            <Link href="/accuracy" className="link">
              View public backtests →
            </Link>
          </div>
          <div className="trust-card">
            <h3>Bayesian Shrinkage</h3>
            <p className="muted">
              Latent component models shrink small samples toward the mean, avoiding fluke single-match spikes.
            </p>
            <Link href="/accuracy#methodology" className="link">
              Read methodology →
            </Link>
          </div>
          <div className="trust-card">
            <h3>Fast &amp; Static-First</h3>
            <p className="muted">
              Precomputed typed data and streaming Web Workers ensure 60fps animations and sub-1s load times.
            </p>
            <Link href="/data" className="link">
              Download datasets &amp; API →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
