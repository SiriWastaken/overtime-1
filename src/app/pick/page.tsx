import { NoData } from '@/components/bits';
import { LaunchPad, type PadTeam } from '@/components/LaunchPad';
import { Tip } from '@/components/ui';
import { seasonEdges } from '@/lib/edge';
import { modelRun, resolveYear, teamMetaMap } from '@/lib/queries';

export const metadata = { title: 'Launch pad' };

const parse = (s: string | undefined) =>
  [...(s ?? '').split(/[\s,]+/).filter((x) => /^\d{1,5}$/.test(x)).slice(0, 3).map((x) => `frc${x}`), null, null, null].slice(0, 3) as (string | null)[];

export default async function Pick({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const year = resolveYear(sp.year);
  if (!year || !modelRun(year)) return <NoData year={year} />;
  const top = seasonEdges(year)?.ranked.slice(0, 24) ?? [];
  const meta = teamMetaMap(top.map((t) => t.team));
  const pool: PadTeam[] = top.map((t) => ({ key: t.team, number: Number(t.team.slice(3)), nickname: meta.get(t.team)?.nickname ?? null, edge: t.edge }));
  return (
    <>
      <div className="page-head">
        <h1>
          Launch pad <em>{year}</em>
        </h1>
        <Tip label="How the launch pad works">Drag robots onto a pad. The rope moves with the odds.</Tip>
      </div>
      <LaunchPad year={year} pool={pool} initial={{ red: parse(sp.red), blue: parse(sp.blue) }} />
    </>
  );
}
