import Link from 'next/link';
import { NoData, Empty } from '@/components/bits';
import { RatingsTable, sortRows, type SortKey } from '@/components/RatingsTable';
import { resolveYear, teamRatings, modelRun } from '@/lib/queries';

export const metadata = { title: 'Teams' };
const PAGE = 100;
const KEYS: SortKey[] = ['net', 'auto', 'teleop', 'endgame', 'def', 'fouls', 'sd', 'vol', 'matches'];

export default async function Teams({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const year = resolveYear(sp.year);
  if (!year || !modelRun(year)) return <NoData year={year} />;
  const q = (sp.q ?? '').slice(0, 60);
  const sort = (KEYS.includes(sp.sort as SortKey) ? sp.sort : 'net') as SortKey;
  const page = Math.max(1, Number(sp.page) || 1);
  const { total, rows } = teamRatings(year, { q: q || undefined });
  const sorted = sortRows(year, rows, sort);
  const shown = sorted.slice((page - 1) * PAGE, page * PAGE);
  const href = (o: Partial<{ sort: string; page: number }>) => {
    const p = new URLSearchParams({ year: String(year), ...(q ? { q } : {}), sort: o.sort ?? sort, page: String(o.page ?? 1) });
    return `/teams?${p}`;
  };
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Teams, {year}</h1>
          <div className="sub">
            {total} teams with {year} matches. Ranked by expected net points per match; the hatched band is the 80% credible range of the scoring contribution.
          </div>
        </div>
      </div>
      <form className="inline" action="/teams">
        <input type="hidden" name="year" value={year} />
        <label className="sr-only" htmlFor="q">
          Search teams
        </label>
        <input id="q" type="search" name="q" defaultValue={q} placeholder="Number, name, city or country" style={{ width: 280 }} />
        <button type="submit">Search</button>
        {q ? (
          <Link href={`/teams?year=${year}`} className="button ghost">
            Clear
          </Link>
        ) : null}
        <span className="muted" style={{ fontSize: 12 }}>
          {rows.length} shown{q ? ` matching “${q}”` : ''}. Rank is the season rank by xPts.
        </span>
      </form>
      {shown.length ? <RatingsTable year={year} rows={shown} sort={sort} sortHref={(k) => href({ sort: k })} /> : <Empty>No teams match “{q}”.</Empty>}
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
