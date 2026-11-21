import Link from 'next/link';
import { cookies } from 'next/headers';
import { Empty, NoData } from '@/components/bits';
import { RatingsTable, sortRows, type SortKey } from '@/components/RatingsTable';
import { Tip } from '@/components/ui';
import { seasonEdges } from '@/lib/edge';
import { seasonForm } from '@/lib/galaxy';
import { modelRun, resolveYear, teamRatings } from '@/lib/queries';

export const metadata = { title: 'Teams' };
const PAGE = 100;
const KEYS: SortKey[] = ['edge', 'net', 'auto', 'teleop', 'endgame', 'def', 'fouls', 'matches'];

export default async function Teams({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const year = resolveYear(sp.year);
  if (!year || !modelRun(year)) return <NoData year={year} />;
  const q = (sp.q ?? '').slice(0, 60);
  const edges = seasonEdges(year)?.byTeam;
  const sort = (KEYS.includes(sp.sort as SortKey) ? sp.sort : edges ? 'edge' : 'net') as SortKey;
  const page = Math.max(1, Number(sp.page) || 1);
  const { total, rows } = teamRatings(year, { q: q || undefined });
  const sorted = sortRows(year, rows, sort, edges);
  const shown = sorted.slice((page - 1) * PAGE, page * PAGE);
  const myKey = (await cookies()).get('ot_myteam')?.value;
  const mine = myKey ? (teamRatings(year).rows.find((r) => r.key === myKey) ?? null) : null;
  const href = (o: Partial<{ sort: string; page: number }>) => {
    const p = new URLSearchParams({ year: String(year), ...(q ? { q } : {}), sort: o.sort ?? sort, page: String(o.page ?? 1) });
    return `/teams?${p}`;
  };
  return (
    <>
      <div className="page-head">
        <h1>
          Teams <em>{year}</em>
        </h1>
        <Tip label="How are teams ranked?">Ranked by EDGE. Tap a row for the card. Pin your team from its card.</Tip>
      </div>
      <form className="inline" action="/teams" role="search">
        <input type="hidden" name="year" value={year} />
        {sort !== (edges ? 'edge' : 'net') ? <input type="hidden" name="sort" value={sort} /> : null}
        <label className="sr-only" htmlFor="q">
          Filter teams
        </label>
        <input id="q" type="search" name="q" defaultValue={q} placeholder="Number, name or city" style={{ width: 300, maxWidth: '100%' }} />
        <button type="submit">Filter</button>
        {q ? (
          <Link href={`/teams?year=${year}`} className="button ghost">
            Clear
          </Link>
        ) : null}
        <span className="muted" style={{ fontSize: 13 }}>
          {q ? `${rows.length} found` : `${total.toLocaleString()} teams`}
        </span>
      </form>
      {shown.length ? (
        <RatingsTable year={year} rows={shown} edges={edges} form={seasonForm(year)} mine={mine} sort={sort} sortHref={(k) => href({ sort: k })} />
      ) : (
        <Empty>
          <strong>Sudden death: no match.</strong>
          Nothing for “{q}”. Try a number or city.
        </Empty>
      )}
      {sorted.length > PAGE ? (
        <div className="pager">
          {page > 1 ? <Link href={href({ page: page - 1 })}>Previous</Link> : null}
          <span className="muted">
            Page {page} of {Math.ceil(sorted.length / PAGE)}
          </span>
          {page * PAGE < sorted.length ? <Link href={href({ page: page + 1 })}>Next</Link> : null}
        </div>
      ) : null}
    </>
  );
}
