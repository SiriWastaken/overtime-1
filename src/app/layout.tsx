import type { Metadata } from 'next';
import { Archivo } from 'next/font/google';
import Link from 'next/link';
import { Suspense } from 'react';
import { Nav, SeasonSelect } from '@/components/Nav';
import { ago, stamp } from '@/lib/format';
import { defaultYear, freshness, seasons } from '@/lib/queries';
import './globals.css';

const archivo = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-archivo', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Overtime 1', template: '%s · Overtime 1' },
  description: 'Season-isolated FRC robot ratings, calibrated match forecasts, playoff and alliance simulation, with published validation and a free public API.',
};

export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const years = seasons().map((s) => s.year);
  const year = defaultYear();
  const f = freshness(year);
  const failed = f.lastSync && f.lastSync.ok === 0;
  return (
    <html lang="en" className={archivo.variable}>
      <body>
        <div className="shell">
          <aside className="rail">
            <Link href="/" className="wordmark">
              Overtime 1<span>FRC ratings &amp; forecasts</span>
            </Link>
            <Suspense>
              <Nav />
              <SeasonSelect years={years} fallback={year} />
            </Suspense>
            <div className="rail-foot">
              {!f.tbaKeyConfigured ? <div className="warn">No TBA key configured. Showing stored data only.</div> : null}
              {f.lastSuccess ? (
                <div>
                  TBA synced <strong>{ago(f.lastSuccess)}</strong>
                </div>
              ) : year ? (
                <div>Never synced successfully</div>
              ) : null}
              {failed ? <div className="warn">Last sync failed {ago(f.lastSync!.finished_at)}: cached data in use</div> : null}
              {f.dataAsOf ? <div>Results through {stamp(f.dataAsOf).replace(/, \d.*$/, '')}</div> : null}
              <div style={{ marginTop: 8 }}>Data: The Blue Alliance</div>
            </div>
          </aside>
          <main className="main" id="main">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
