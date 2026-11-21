import { redirect } from 'next/navigation';

// "Scout" was renamed "Teams".
export default async function Scout({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const p = new URLSearchParams(await searchParams);
  redirect(`/teams${p.size ? `?${p}` : ''}`);
}
