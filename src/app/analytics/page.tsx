import { redirect } from 'next/navigation';

export default async function AnalyticsRedirect({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const year = sp.year;
  const target = year ? `/accuracy?year=${year}` : '/accuracy';
  redirect(target);
}
