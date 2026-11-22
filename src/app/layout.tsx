import type { Metadata, Viewport } from 'next';
import { Barlow_Condensed, Geist, Geist_Mono } from 'next/font/google';
import { Suspense } from 'react';
import { Header } from '@/components/Header';
import { Rail } from '@/components/Nav';
import { Palette } from '@/components/Palette';
import { TeamPeek } from '@/components/TeamPeek';
import { Toaster } from '@/components/ui';
import { defaultYear, seasons } from '@/lib/queries';
import './globals.css';

const sans = Geist({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });
const display = Barlow_Condensed({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Overtime 1', template: '%s · Overtime 1' },
  description: 'Find any FRC team fast. Team reports, alliance picking and match predictions with EDGE, from this season’s matches.',
};
export const viewport: Viewport = { themeColor: '#02030a', width: 'device-width', initialScale: 1 };
export const dynamic = 'force-dynamic';

// Applied before paint so Calm mode never flashes motion.
const CALM = `try{localStorage.getItem('ot:calm')==='1'&&document.documentElement.setAttribute('data-calm','')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const years = seasons().filter((s) => s.modelled).map((s) => s.year); // a season without a model would open on an empty screen
  const year = defaultYear();
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: CALM }} />
      </head>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <Suspense>
          <Header years={years} fallback={year} />
          <Rail fallback={year} />
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
