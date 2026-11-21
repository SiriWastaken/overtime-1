import Link from 'next/link';
import { Empty } from '@/components/bits';
import { dateRange, location } from '@/lib/format';
import { events, resolveYear } from '@/lib/queries';

export const metadata = { title: 'Events' };

const groupOf = (e: { event_type: number; week: number | null }) =>
  e.event_type === 3 || e.event_type === 4 ? 'Championship' : e.event_type >= 99 ? 'Off-season (not rated)' : e.week === null ? 'Other' : `Week ${e.week + 1}`;

export default async function Events({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const year = resolveYear(sp.year);
  const q = (sp.q ?? '').toLowerCase().slice(0, 60);
  const all = year ? events(year) : [];
  const list = all.filter((e) => !q || `${e.name} ${e.city} ${e.state_prov} ${e.country} ${e.key}`.toLowerCase().includes(q));
  const groups = new Map<string, typeof list>();
  for (const e of list) groups.set(groupOf(e), [...(groups.get(groupOf(e)) ?? []), e]);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Events, {year}</h1>
          <div className="sub">Every {year} event TBA lists. Official events feed the ratings; off-season events are listed but not rated (different rules and team numbers).</div>
        </div>
      </div>
      <form className="inline" action="/events">
        <input type="hidden" name="year" value={year ?? ''} />
        <label className="sr-only" htmlFor="q">
          Filter events
        </label>
        <input id="q" type="search" name="q" defaultValue={q} placeholder="Name, city, state, country or key" style={{ width: 280 }} />
        <button type="submit">Filter</button>
      </form>
      {list.length === 0 ? (
        <Empty>{all.length ? 'No events match that filter.' : `No ${year ?? ''} events synced yet.`}</Empty>
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
                <th className="n">Played</th>
              </tr>
            </thead>
            <tbody>
              {[...groups].map(([g, evs]) => [
                <tr className="group" key={g}>
                  <td colSpan={6}>{g}</td>
                </tr>,
                ...evs.map((e) => (
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
                    <td className="n">{e.scheduled ? `${e.played}/${e.scheduled}` : '—'}</td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
