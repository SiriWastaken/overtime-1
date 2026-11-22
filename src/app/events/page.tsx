import Link from 'next/link';
import { Empty } from '@/components/bits';
import { Tip, Why } from '@/components/ui';
import { dateRange, location } from '@/lib/format';
import { eventTeamKeys, events, resolveYear, teamRatings } from '@/lib/queries';

export const metadata = { title: 'Events' };

const groupOf = (e: { event_type: number; week: number | null }) =>
  e.event_type === 3 || e.event_type === 4 ? 'Championship' : e.event_type >= 99 ? 'Off-season (not rated)' : e.week === null ? 'Other' : `Week ${e.week + 1}`;

export default async function Events({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const year = resolveYear(sp.year);
  const q = (sp.q ?? '').toLowerCase().slice(0, 60);
  const all = year ? events(year) : [];
  const { rows: tRows } = year ? teamRatings(year) : { rows: [] };
  const ratingMap = new Map(tRows.map((r) => [r.key, r.rating.net]));

  const list = all.filter((e) => !q || `${e.name} ${e.city} ${e.state_prov} ${e.country} ${e.key}`.toLowerCase().includes(q));
  const groups = new Map<string, typeof list>();
  for (const e of list) groups.set(groupOf(e), [...(groups.get(groupOf(e)) ?? []), e]);
  return (
    <>
      <div className="page-head">
        <h1>
          Events <em>{year}</em>
        </h1>
        <Tip label="Which events count?">Only official events feed ratings. Off-season events are listed, not rated.</Tip>
      </div>
      <form className="inline" action="/events" role="search">
        <input type="hidden" name="year" value={year ?? ''} />
        <label className="sr-only" htmlFor="q">
          Filter events
        </label>
        <input id="q" type="search" name="q" defaultValue={q} placeholder="Name, city or code" style={{ width: 300, maxWidth: '100%' }} />
        <button type="submit">Filter</button>
      </form>
      {list.length === 0 ? (
        <Empty>
          <strong>Nobody matches that.</strong>
          {all.length ? 'Nothing matches. Try a city.' : 'No events synced yet.'}
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="agate">
            <thead>
              <tr>
                <th>Event</th>
                <th className="hide-m">Location</th>
                <th>Dates</th>
                <th>Status</th>
                <th className="n">Teams</th>
                <th className="n">Field Strength</th>
                <th className="n">Played</th>
              </tr>
            </thead>
            <tbody>
              {[...groups].map(([g, evs]) => [
                <tr className="group" key={g}>
                  <td colSpan={7}>{g}</td>
                </tr>,
                ...evs.map((e) => {
                  const keys = eventTeamKeys(e.key);
                  const nets = keys.map((k) => ratingMap.get(k) ?? 0);
                  const strength = nets.length ? nets.reduce((a, b) => a + b, 0) / nets.length : null;
                  return (
                    <tr key={e.key}>
                      <td className="wrap">
                        <Link href={`/events/${e.key}`}>{e.name}</Link>
                        {e.district_name ? <span className="muted"> · {e.district_name}</span> : null}
                      </td>
                      <td className="hide-m muted">{location(e)}</td>
                      <td className="muted">{dateRange(e.start_date, e.end_date)}</td>
                      <td>
                        <span className={`status ${e.status}`}>{e.status}</span>
                      </td>
                      <td className="n">{e.teams || '—'}</td>
                      <td className="n strong">{strength !== null && strength > 0 ? `+${strength.toFixed(1)}` : '—'}</td>
                      <td className="n">{e.scheduled ? `${e.played}/${e.scheduled}` : '—'}</td>
                    </tr>
                  );
                }),
              ])}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
