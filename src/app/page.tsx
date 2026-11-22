import Link from 'next/link';
import { Avatar, NoData } from '@/components/bits';
import { Dice } from '@/components/Dice';
import { Mascot } from '@/components/Mascot';
import { MonteCarlo, type McMatch } from '@/components/MonteCarlo';
import { Why } from '@/components/ui';
import { seasonSpec } from '@/engine/seasons';
import { dateRange, location, matchLabel } from '@/lib/format';
import { TREND_SPAN } from '@/lib/galaxy';
import { activeOrFeaturedEvents, biggestMovers, events, modelRun, recentMatches, resolveYear, teamRatings } from '@/lib/queries';

export const metadata = {
  title: { absolute: 'Overtime 1 · FRC data you can poke at' },
  description: 'Find any FRC team or event. Ratings with honest uncertainty, alliance picks and match forecasts from this season’s matches.',
};

const STATUS = { live: 'Live', completed: 'Done', upcoming: 'Soon' } as const;

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const year = resolveYear((await searchParams).year);
  if (!year || !modelRun(year)) return <NoData year={year} />;
  const spec = seasonSpec(year);
  const rated = teamRatings(year).rows;
  const today = activeOrFeaturedEvents(year, 6);
  const anyLive = today.some((e) => e.status === 'live');
  const { gainers } = biggestMovers(year, 6);
  const evName = new Map(events(year).map((e) => [e.key, e.short_name || e.name]));
  const mc: McMatch[] = recentMatches(year, 'completed', 40)
    .filter((m) => m.prediction?.forecast && m.redScore !== null && m.blueScore !== null && m.redScore >= 0)
    .slice(0, 12)
    .map((m) => ({
      key: m.key,
      label: matchLabel(m),
      event: evName.get(m.eventKey) ?? m.eventKey,
      red: m.red.map((t) => Number(t.slice(3))),
      blue: m.blue.map((t) => Number(t.slice(3))),
      margin: m.prediction!.forecast.margin,
      marginSd: m.prediction!.forecast.marginSd,
      redWinProb: m.prediction!.forecast.redWinProb,
      redScore: m.redScore!,
      blueScore: m.blueScore!,
    }));

  return (
    <div className="home-lab">
      <section className="hl-top">
        <div className="hl-find">
          <h1>Find a team or event</h1>
          <p className="hl-sub">
            {year} {spec.game} · {rated.length.toLocaleString()} teams rated from this season’s matches only
          </p>
          <form action="/search" role="search" className="hl-search">
            <input type="hidden" name="year" value={year} />
            <label className="sr-only" htmlFor="hl-q">
              Team number, name, event or city
            </label>
            <input id="hl-q" type="search" name="q" placeholder="254, Cheesy Poofs, Silicon Valley…" autoComplete="off" enterKeyHint="search" />
            <button type="submit">Find</button>
          </form>
        </div>
        <div className="hl-dice sticker">
          <Mascot />
          <p>Not sure where to start? Let chance pick.</p>
          <Dice year={year} teams={rated.map((r) => r.number)} />
        </div>
      </section>

      <section aria-labelledby="today-h">
        <div className="hl-head">
          <h2 id="today-h">{anyLive ? 'Today' : 'Latest events'}</h2>
          <Link href={`/events?year=${year}`}>All events</Link>
        </div>
        {today.length ? (
          <ul className="hl-today">
            {today.map((e) => (
              <li key={e.key}>
                <Link href={`/events/${e.key}`} className="ev-card">
                  <span className={`chip st-${e.status}`}>{STATUS[e.status]}</span>
                  <b className="ev-name">{e.short_name || e.name}</b>
                  <span className="ev-meta">
                    {dateRange(e.start_date, e.end_date)} · {location(e)}
                  </span>
                  <span className="ev-stats">
                    {e.teams} teams · {e.played} of {e.scheduled} played
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">
            <Mascot mood="think" />
            <strong>No events yet.</strong> The robots are stretching.
          </div>
        )}
      </section>

      <div className="hl-grid">
        {mc.length ? <MonteCarlo matches={mc} /> : null}
        <section className="card hl-movers" aria-labelledby="movers-h">
          <div className="hl-head">
            <h2 id="movers-h">Biggest movers</h2>
            <Why
              title="Biggest movers"
              value={`Last ${TREND_SPAN} matches`}
              inputs={['Each team’s rating after every match this season']}
              method={`Change in points added per match over the team’s last ${TREND_SPAN} matches. Teams need ${2 * TREND_SPAN} matches to qualify.`}
              uncertainty="A ten-match change includes noise; a jump of a few points can be luck."
            />
          </div>
          {gainers.length ? (
            <ol className="movers">
              {gainers.map((m) => (
                <li key={m.key} data-peek={m.key} data-year={year}>
                  <Avatar team={m.number} year={year} />
                  <span className="team-num">{m.number}</span>
                  <span className="nm">{m.nickname ?? ''}</span>
                  <span className="mv-n">
                    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                      <path d="M5 1 9.5 9h-9z" fill="var(--d-mint)" stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round" />
                    </svg>
                    +{m.deltaNet.toFixed(1)}
                    <small> pts</small>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">Nobody has played enough matches to move yet.</p>
          )}
        </section>
      </div>

      <nav className="hl-more" aria-label="More">
        <Link href={`/pick?year=${year}`}>Pick your alliance</Link>
        <Link href={`/compare?year=${year}`}>Compare teams</Link>
        <Link href={`/lab?year=${year}`}>Lab</Link>
        <Link href={`/accuracy?year=${year}`}>Track record</Link>
        <Link href="/data">Data & API</Link>
      </nav>
    </div>
  );
}
