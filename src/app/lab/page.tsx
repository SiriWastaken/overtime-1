import { cookies } from 'next/headers';
import Link from 'next/link';
import { PickBoard } from '@/components/PickBoard';
import { Galaxy } from '@/components/Galaxy';
import { seasonSpec } from '@/engine/seasons';
import { galaxy } from '@/lib/galaxy';
import { defaultYear, event, eventTeamKeys, modelRun, resolveYear, teamRatings } from '@/lib/queries';
import { LabSimulator } from './LabSimulator';
import { SeasonExplorer } from './SeasonExplorer';

export const metadata = {
  title: 'Lab & Simulator · Overtime 1',
  description: 'Monte Carlo schedule simulations, Alliance Selection copilot, 2D Season Explorer, and what-if model analysis.',
};

const LAB_TABS = [
  { id: 'simulator', label: 'Monte Carlo Simulator' },
  { id: 'alliance', label: 'Alliance Selection' },
  { id: 'explorer', label: 'Season Explorer' },
] as const;

export default async function LabPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const year = resolveYear(sp.year) ?? defaultYear() ?? 2026;
  const activeTab = (sp.tab as 'simulator' | 'alliance' | 'explorer') || 'simulator';
  const run = modelRun(year);

  // Load team ratings for Simulator & Explorer
  const { rows } = teamRatings(year, { limit: 250 });
  const initialTeams = rows.map((r) => ({
    key: r.key,
    number: r.number,
    nickname: r.nickname ?? '',
    net: r.rating.net,
    sd: r.rating.total.sd,
  }));

  const explorerTeams = rows.map((r) => ({
    number: r.number,
    nickname: r.nickname ?? '',
    auto: r.rating.components.auto?.mean ?? 0,
    teleop: r.rating.components.teleop?.mean ?? 0,
    endgame: r.rating.components.endgame?.mean ?? 0,
    net: r.rating.net,
    defense: r.rating.defense?.mean ?? 0,
  }));

  // Alliance selection setup
  const ev = sp.event && /^\d{4}[a-z0-9]+$/.test(sp.event) ? event(sp.event) : null;
  const myKey = (await cookies()).get('ot_myteam')?.value ?? null;
  const mine = myKey && /^frc\d{1,5}$/.test(myKey) ? myKey : null;

  return (
    <div className="page-container lab-page">
      <div className="page-head">
        <div>
          <h1>
            Analytics Lab <em>{year}</em>
          </h1>
          <p className="sub">
            Interactive simulation and modeling sandbox: test hypotheses, run Monte Carlo draws, and simulate draft outcomes.
          </p>
        </div>
      </div>

      {/* Lab Mode Tabs */}
      <nav className="tabs" aria-label="Lab sections">
        {LAB_TABS.map((t) => (
          <Link
            key={t.id}
            href={`/lab?year=${year}&tab=${t.id}${sp.event ? `&event=${sp.event}` : ''}`}
            aria-current={activeTab === t.id ? 'page' : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {/* Tab 1: Monte Carlo Simulator */}
      {activeTab === 'simulator' ? (
        <LabSimulator year={year} initialTeams={initialTeams} />
      ) : null}

      {/* Tab 2: Alliance Selection Mode */}
      {activeTab === 'alliance' ? (
        <div className="lab-alliance-wrap">
          <PickBoard
            year={year}
            event={ev ? { key: ev.key, name: ev.name } : null}
            mine={mine}
          />
        </div>
      ) : null}

      {/* Tab 3: Season Explorer */}
      {activeTab === 'explorer' ? (
        <SeasonExplorer year={year} teams={explorerTeams} />
      ) : null}
    </div>
  );
}
