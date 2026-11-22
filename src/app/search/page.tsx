import { defaultYear, resolveYear, searchIndex } from '@/lib/queries';
import { SearchClient } from './SearchClient';

export const metadata = {
  title: 'Search Teams & Events · Overtime 1',
  description: 'Instant local prefix search across thousands of FRC teams and events. Powered by a precomputed compact client-side index.',
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const year = resolveYear(sp.year) ?? defaultYear() ?? 2026;
  const index = searchIndex(year);

  return (
    <div className="page-container search-page">
      <div className="page-head">
        <div>
          <h1>
            Search <em>{year}</em>
          </h1>
          <p className="sub">
            {index.teams.length.toLocaleString()} teams and {index.events.length} events.
          </p>
        </div>
      </div>

      <SearchClient
        year={year}
        teams={index.teams as [number, string, string, number][]}
        events={index.events as [string, string, string, string][]}
        initialQ={(sp.q ?? '').slice(0, 60)}
      />
    </div>
  );
}
