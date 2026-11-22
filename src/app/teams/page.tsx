import Link from 'next/link';
import { cookies } from 'next/headers';
import { Empty, NoData } from '@/components/bits';
import { Galaxy } from '@/components/Galaxy';
import { seasonSpec } from '@/engine/seasons';
import { RatingsTable, sortRows, type SortKey } from '@/components/RatingsTable';
import { Tip, Why } from '@/components/ui';
import { seasonEdges } from '@/lib/edge';
import { galaxy, seasonForm } from '@/lib/galaxy';
import { modelRun, resolveYear, teamRatings } from '@/lib/queries';

export const metadata = { title: 'Teams' };
const PAGE = 100;
const KEYS: SortKey[] = ['edge', 'net', 'auto', 'teleop', 'endgame', 'def', 'fouls', 'matches'];

export default async function Teams({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const year = resolveYear(sp.year);
  if (!year || !modelRun(year)) return <NoData year={year} />;
  const myKey = (await cookies()).get('ot_myteam')?.value;
  const map = sp.view !== 'list' && !sp.q && !sp.sort && !sp.page ? galaxy(year) : null;
  if (map)
    return <Galaxy data={map} mine={Number(myKey?.slice(3)) || null} title={`${year} ${seasonSpec(year).game}`} />;
  const q = (sp.q ?? '').slice(0, 60);
  const edges = seasonEdges(year)?.byTeam;
  const sort = (KEYS.includes(sp.sort as SortKey) ? sp.sort : edges ? 'edge' : 'net') as SortKey;
  const page = Math.max(1, Number(sp.page) || 1);
  const { total, rows } = teamRatings(year, { q: q || undefined });
  const sorted = sortRows(year, rows, sort, edges);
  const shown = sorted.slice((page - 1) * PAGE, page * PAGE);
  const mine = myKey ? (teamRatings(year).rows.find((r) => r.key === myKey) ?? null) : null;
  const href = (o: Partial<{ sort: string; page: number }>) => {
    const p = new URLSearchParams({ year: String(year), view: 'list', ...(q ? { q } : {}), sort: o.sort ?? sort, page: String(o.page ?? 1) });
    return `/teams?${p}`;
  };
  return (
    <>
      <div className="page-head">
        <h1>
          All teams <em>{year}</em>
        </h1>
        <Why
          title="Team Rankings (EDGE & xPts)"
          method="Teams are ranked by EDGE (win-chance points gained over a median robot across simulated match contexts). Point estimates (xPts) are derived from Bayesian ridge regression with exact partner credit splitting."
          inputs={['All official qualification and playoff matches', 'Score breakdown objects', 'Previous season ratings for Bayesian priors']}
        />
        <Link href={`/teams?year=${year}`} className="button ghost">
          Map
        </Link>
      </div>
      <form className="inline" action="/teams" role="search">
        <input type="hidden" name="year" value={year} />
        <input type="hidden" name="view" value="list" />
        {sort !== (edges ? 'edge' : 'net') ? <input type="hidden" name="sort" value={sort} /> : null}
        <label className="sr-only" htmlFor="q">
          Filter teams
        </label>
        <input id="q" type="search" name="q" defaultValue={q} placeholder="Number, name or city" style={{ width: 300, maxWidth: '100%' }} />
        <button type="submit">Filter</button>
        {q ? (
          <Link href={`/teams?year=${year}&view=list`} className="button ghost">
            Clear
          </Link>
        ) : null}
        <span className="muted">
          {q ? `${rows.length} found` : `${total.toLocaleString()} teams`}
        </span>
      </form>
      {shown.length ? (
        <RatingsTable year={year} rows={shown} edges={edges} form={seasonForm(year)} mine={mine} sort={sort} sortHref={(k) => href({ sort: k })} />
      ) : (
        <Empty>
          <strong>Nobody matches that.</strong>
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
