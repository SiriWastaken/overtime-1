import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Geist } from 'next/font/google';
import { Suspense } from 'react';
import { Header } from '@/components/Header';
import { Tabs } from '@/components/Nav';
import { Palette } from '@/components/Palette';
import { TeamPeek } from '@/components/TeamPeek';
import { Toaster } from '@/components/ui';
import { defaultYear, seasons } from '@/lib/queries';
import './globals.css';

const sans = Geist({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
// Two families: a friendly-sharp display face for headings and hero numerals, Geist for UI and tabular numbers.
const display = Bricolage_Grotesque({ subsets: ['latin'], weight: '800', variable: '--font-display', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Overtime 1', template: '%s · Overtime 1' },
  description: 'Find any FRC team fast. Team reports, alliance picking and match predictions with EDGE, from this season’s matches.',
};
export const viewport: Viewport = { themeColor: [{ media: '(prefers-color-scheme: light)', color: '#fff3d6' }, { media: '(prefers-color-scheme: dark)', color: '#17171a' }], width: 'device-width', initialScale: 1 };
export const dynamic = 'force-dynamic';

// Applied before paint so Calm mode never flashes motion and the theme never flashes. Theme: saved choice, else the system's.
const PREPAINT = `try{var d=document.documentElement,t=localStorage.getItem('ot:theme');localStorage.getItem('ot:calm')==='1'&&d.setAttribute('data-calm','');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))d.setAttribute('data-theme','dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const years = seasons().filter((s) => s.modelled).map((s) => s.year); // a season without a model would open on an empty screen
  const year = defaultYear();
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREPAINT }} />
      </head>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <Suspense>
          <Header years={years} fallback={year} />
          <Tabs />
          <Palette years={years} fallback={year} />
        </Suspense>
        <main className="main" id="main">
          {children}
        </main>
        <Toaster />
        <TeamPeek />
      </body>
    </html>
  );
}
