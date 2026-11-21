import Link from 'next/link';
import { resolveYear } from '@/lib/queries';

export const metadata = { title: 'Directory' };

export default async function Directory({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const year = resolveYear((await searchParams).year);
  const y = year ? `?year=${year}` : '';
  const groups: [string, [string, string][]][] = [
    [
      'Lists',
      [
        [`/teams${y}`, 'All teams'],
        [`/events${y}`, 'Events'],
      ],
    ],
    [
      'The model',
      [
        [`/analytics${y}`, 'Track record'],
        ['/methodology', 'How it works'],
      ],
    ],
    [
      'Build on it',
      [
        ['/developers', 'Data & API'],
        ['/styleguide', 'Style guide'],
      ],
    ],
  ];
  return (
    <>
      <div className="page-head">
        <h1>Directory</h1>
      </div>
      <div className="directory">
        {groups.map(([h, links]) => (
          <section key={h} className="glass">
            <h2>{h}</h2>
            <ul>
              {links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href}>{label}</Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
