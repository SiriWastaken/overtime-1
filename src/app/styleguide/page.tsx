import { RatingsTable, sortRows } from '@/components/RatingsTable';
import { Spark, WinBar } from '@/components/bits';
import { EdgeGauge } from '@/components/edge';
import { Tug } from '@/components/Tug';
import { Tip } from '@/components/ui';
import { seasonEdges } from '@/lib/edge';
import { seasonForm } from '@/lib/galaxy';
import { defaultYear, teamRatings } from '@/lib/queries';
import { FxDemo } from './Demo';

export const metadata = { title: 'Style guide', robots: { index: false } };

const SWATCHES: [string, string][] = [
  ['--bg', 'Background'],
  ['--bg-2', 'Surface'],
  ['--bg-3', 'Surface, hover'],
  ['--text', 'Text'],
  ['--text-2', 'Text, secondary'],
  ['--text-3', 'Text, tertiary'],
  ['--accent', 'Accent'],
  ['--pos', 'EDGE helps'],
  ['--neg', 'EDGE hurts'],
  ['--red', 'Red alliance'],
  ['--blue', 'Blue alliance'],
];

export default function Styleguide() {
  const year = defaultYear();
  const se = year ? seasonEdges(year) : null;
  const rows = year && se ? sortRows(year, teamRatings(year).rows, 'edge', se.byTeam).slice(0, 5) : [];
  return (
    <>
      <div className="page-head">
        <h1>Style guide</h1>
      </div>

      <section className="section">
        <h2 className="sg-h">Colour</h2>
        <div className="swatches">
          {SWATCHES.map(([v, name]) => (
            <div key={v} style={{ boxShadow: `inset 0 40px 0 var(${v})` }}>
              {name}
              <br />
              <code>{v}</code>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="sg-h">Type: five sizes</h2>
        <div style={{ display: 'grid', gap: 12 }}>
          <span style={{ font: '600 var(--t-5)/1 var(--font-display)' }}>40 · Display, Barlow Condensed</span>
          <span style={{ font: '600 var(--t-4)/1 var(--font-display)' }}>24 · Section heading, big numbers</span>
          <span style={{ fontSize: 'var(--t-3)' }}>16 · Inputs, team numbers</span>
          <span style={{ fontSize: 'var(--t-2)' }}>14 · Body and table text (Geist), tabular: 1,234.5</span>
          <span style={{ fontSize: 'var(--t-1)', color: 'var(--text-2)' }}>12 · Labels and captions</span>
        </div>
      </section>

      <section className="section">
        <h2 className="sg-h">EDGE (the only way it is shown)</h2>
        <div style={{ display: 'grid', gap: 16, maxWidth: 560 }}>
          <EdgeGauge edge={0.48} lo={0.41} hi={0.52} size="lg" />
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
            <EdgeGauge edge={0.22} size="md" />
            <EdgeGauge edge={-0.12} />
            <EdgeGauge edge={0.05} matches={4} />
            <EdgeGauge edge={0.31} size="xs" />
            <span className="team-num hot">1690</span>
            <span className="team-num">2056</span>
            <Spark values={[40, 44, 43, 50, 55, 61]} trend={1} />
          </div>
          <Tug redP={0.63} red={{ mean: 132, lo80: 110, hi80: 154 }} blue={{ mean: 118, lo80: 95, hi80: 140 }} />
        </div>
      </section>

      <section className="section">
        <h2 className="sg-h">Stats row</h2>
        <div className="tiles">
          <div className="tile hero-tile">
            <small>
              EDGE · extra wins per 100 matches <Tip>Compared with a median robot.</Tip>
            </small>
            <EdgeGauge edge={0.48} lo={0.41} hi={0.52} size="lg" />
          </div>
          <div className="tile">
            <b>#12</b>
            <small>Rank of 3,709</small>
          </div>
          <div className="tile">
            <b>98.4</b>
            <small>Points added / match</small>
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="sg-h">Controls</h2>
        <div style={{ display: 'grid', gap: 16 }}>
          <FxDemo />
          <input type="search" placeholder="Search field" aria-label="Search field demo" style={{ maxWidth: 320 }} />
          <WinBar p={0.64} />
        </div>
      </section>

      {year && rows.length ? (
        <section className="section">
          <h2 className="sg-h">Table (live data, tap a row)</h2>
          <RatingsTable year={year} rows={rows} edges={se?.byTeam} form={seasonForm(year)} mine={rows[2]} compact />
        </section>
      ) : null}

      <section className="section">
        <h2 className="sg-h">States</h2>
        <div className="grid-3">
          <div className="empty">
            <strong>Sudden death: no match.</strong>
            Try another team.
          </div>
          <div className="empty">Clock’s running…</div>
          <div className="notice">
            <strong>Timeout.</strong> Try again in a moment.
          </div>
        </div>
      </section>
    </>
  );
}
