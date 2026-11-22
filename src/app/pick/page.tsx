import { cookies } from 'next/headers';
import { NoData } from '@/components/bits';
import { Galaxy } from '@/components/Galaxy';
import { PickBoard } from '@/components/PickBoard';
import { seasonSpec } from '@/engine/seasons';
import { galaxy, type GalaxyData } from '@/lib/galaxy';
import { event, eventTeamKeys, modelRun, resolveYear } from '@/lib/queries';

export const metadata = { title: 'Pick' };

export default async function Pick({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const year = resolveYear(sp.year);
  const data = year && modelRun(year) ? galaxy(year) : null;
  if (!year || !data) return <NoData year={year} />;
  const ev = sp.event && /^\d{4}[a-z0-9]+$/.test(sp.event) ? event(sp.event) : null;
  // at an event, the field is its roster
  const roster = ev ? new Set(eventTeamKeys(ev.key).map((k) => Number(k.slice(3)))) : null;
  const myKey = (await cookies()).get('ot_myteam')?.value ?? null;
  const mine = myKey && /^frc\d{1,5}$/.test(myKey) ? myKey : null;
  return (
    <PickBoard
      year={year}
      event={ev ? { key: ev.key, name: ev.name } : null}
      mine={mine}
      field={<Galaxy data={roster ? only(data, roster) : data} mine={mine ? Number(mine.slice(3)) : null} title={`${year} ${seasonSpec(year).game}`} bare />}
    />
  );
}

function only(d: GalaxyData, keep: Set<number>): GalaxyData {
  const idx = d.n.flatMap((n, i) => (keep.has(n) ? [i] : []));
  const pick = <T,>(a: T[]) => idx.map((i) => a[i]);
  return { year: d.year, n: pick(d.n), name: pick(d.name), x: pick(d.x), y: pick(d.y), e: pick(d.e), t: pick(d.t) };
}
