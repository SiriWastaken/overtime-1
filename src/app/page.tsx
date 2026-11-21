import { cookies } from 'next/headers';
import { NoData } from '@/components/bits';
import { Galaxy } from '@/components/Galaxy';
import { seasonSpec } from '@/engine/seasons';
import { galaxy } from '@/lib/galaxy';
import { modelRun, resolveYear } from '@/lib/queries';

export default async function Explore({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const year = resolveYear(sp.year);
  const data = year && modelRun(year) ? galaxy(year) : null;
  if (!year || !data) return <NoData year={year} />;
  const mine = Number((await cookies()).get('ot_myteam')?.value.slice(3)) || null;
  return (
    <Galaxy
      data={data}
      mine={mine}
      title={`${year} ${seasonSpec(year).game}`}
    />
  );
}
