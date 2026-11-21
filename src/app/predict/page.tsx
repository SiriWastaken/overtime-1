import { NoData } from '@/components/bits';
import { MatchSim } from '@/components/MatchSim';
import { Tip } from '@/components/ui';
import { modelRun, resolveYear } from '@/lib/queries';

export const metadata = { title: 'Predict' };

const parse = (s: string | undefined) => (s ?? '').split(/[\s,]+/).filter((x) => /^\d{1,5}$/.test(x)).slice(0, 3);

export default async function Predict({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const year = resolveYear(sp.year);
  if (!year || !modelRun(year)) return <NoData year={year} />;
  return (
    <>
      <div className="page-head">
        <h1>
          Sudden death <em>{year}</em>
        </h1>
        <Tip label="How Predict works">Type up to three teams a side. Odds from this season’s matches.</Tip>
      </div>
      <MatchSim year={year} initial={{ red: parse(sp.red), blue: parse(sp.blue) }} />
    </>
  );
}
