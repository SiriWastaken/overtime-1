import { redirect } from 'next/navigation';

// The Lab became the launch pad under Pick.
export default async function Lab({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const p = new URLSearchParams();
  for (const k of ['year', 'red', 'blue']) if (sp[k]) p.set(k, sp[k]);
  redirect(`/pick${p.size ? `?${p}` : ''}`);
}
