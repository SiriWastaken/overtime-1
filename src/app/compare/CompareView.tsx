'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Avatar } from '@/components/bits';
import { Why, UncertaintyFuzzBar } from '@/components/ui';
import { normalCdf } from '@/engine/stats';

interface TeamCompareData {
  key: string;
  number: number;
  nickname: string | null;
  city: string | null;
  state_prov: string | null;
  country: string | null;
  rank: number;
  net: number;
  sd: number;
  matches: number;
  components: {
    auto: { mean: number; sd: number };
    teleop: { mean: number; sd: number };
    endgame: { mean: number; sd: number };
    defense: { mean: number; sd: number } | null;
    fouls: { mean: number; sd: number };
  };
  history: { t: number; mean: number }[];
}

export function CompareView({
  year,
  initialTeams,
  allTeamNumbers,
}: {
  year: number;
  initialTeams: TeamCompareData[];
  allTeamNumbers: { number: number; nickname: string }[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [inputVal, setInputVal] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const currentNumbers = initialTeams.map((t) => t.number);

  const addTeam = (num: number) => {
    if (currentNumbers.includes(num)) {
      setErrorMsg(`Team ${num} is already added.`);
      return;
    }
    if (currentNumbers.length >= 4) {
      setErrorMsg('You can compare at most 4 teams at once.');
      return;
    }
    const next = [...currentNumbers, num];
    const params = new URLSearchParams(sp.toString());
    params.set('teams', next.join(','));
    params.set('year', String(year));
    router.push(`/compare?${params.toString()}`);
  };

  const removeTeam = (num: number) => {
    const next = currentNumbers.filter((n) => n !== num);
    const params = new URLSearchParams(sp.toString());
    if (next.length) params.set('teams', next.join(','));
    else params.delete('teams');
    params.set('year', String(year));
    router.push(`/compare?${params.toString()}`);
  };

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const num = Number(inputVal.trim());
    if (!Number.isInteger(num) || num <= 0) {
      setErrorMsg('Enter a valid team number (e.g. 254).');
      return;
    }
    addTeam(num);
    setInputVal('');
  };

  // Head-to-Head match simulator between pairs
  const headToHead = (a: TeamCompareData, b: TeamCompareData) => {
    const margin = a.net - b.net;
    const matchNoiseSd = 18;
    const sd = Math.sqrt(a.sd * a.sd + b.sd * b.sd + matchNoiseSd * matchNoiseSd);
    const pA = normalCdf(margin / sd);
    return {
      pA: Math.round(pA * 100),
      pB: Math.round((1 - pA) * 100),
      margin,
    };
  };

  return (
    <div className="compare-workspace">
      {/* Team Selection Bar */}
      <div className="compare-selector-bar">
        <form onSubmit={handleInputSubmit} className="add-team-form">
          <input
            type="number"
            placeholder="Add team number (e.g. 254)..."
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            className="compare-team-input"
          />
          <button type="submit" className="button primary" disabled={currentNumbers.length >= 4}>
            Add to Compare
          </button>
        </form>

        <div className="compare-chips">
          {initialTeams.map((t) => (
            <div key={t.key} className="compare-chip">
              <Avatar team={t.number} year={year} size={20} />
              <span className="chip-num">{t.number}</span>
              <span className="chip-name hide-s">{t.nickname ?? ''}</span>
              <button
                type="button"
                className="chip-remove"
                onClick={() => removeTeam(t.number)}
                aria-label={`Remove team ${t.number}`}
              >
                ✕
              </button>
            </div>
          ))}
          {initialTeams.length === 0 ? (
            <span className="muted">No teams selected. Add 2 to 4 teams to compare.</span>
          ) : null}
        </div>
      </div>

      {errorMsg ? <div className="notice warn">{errorMsg}</div> : null}

      {initialTeams.length < 2 ? (
        <div className="empty-panel">
          <h3>Compare 2 to 4 teams side-by-side</h3>
          <p className="muted">Select top competitors or division contenders to analyze ratings, components, and head-to-head win odds.</p>
          <div className="preset-suggestions">
            <span className="muted">Popular comparisons:</span>
            <button
              type="button"
              className="button ghost small"
              onClick={() => {
                const params = new URLSearchParams(sp.toString());
                params.set('teams', '1690,254,2056');
                params.set('year', String(year));
                router.push(`/compare?${params.toString()}`);
              }}
            >
              1690 vs 254 vs 2056
            </button>
            <button
              type="button"
              className="button ghost small"
              onClick={() => {
                const params = new URLSearchParams(sp.toString());
                params.set('teams', '1323,4414,2910');
                params.set('year', String(year));
                router.push(`/compare?${params.toString()}`);
              }}
            >
              1323 vs 4414 vs 2910
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Side-by-Side Summary Cards */}
          <div className="compare-cards-grid" style={{ gridTemplateColumns: `repeat(${initialTeams.length}, 1fr)` }}>
            {initialTeams.map((t) => (
              <div key={t.key} className="compare-team-card">
                <div className="compare-card-head">
                  <Avatar team={t.number} year={year} size={36} />
                  <div>
                    <Link href={`/teams/${t.number}?year=${year}`} className="team-title-link">
                      <h3 className="team-num">#{t.number}</h3>
                    </Link>
                    <span className="team-nick muted">{t.nickname ?? ''}</span>
                  </div>
                </div>

                <div className="compare-rating-hero">
                  <div className="hero-stat">
                    <span className="stat-big">+{t.net.toFixed(1)}</span>
                    <span className="stat-sub muted">xPts net</span>
                  </div>
                  <div className="hero-stat">
                    <span className="stat-big">#{t.rank}</span>
                    <span className="stat-sub muted">rank</span>
                  </div>
                </div>

                <div className="fuzz-container">
                  <span className="muted fuzz-lbl">Uncertainty range (±{t.sd.toFixed(1)} SD)</span>
                  <UncertaintyFuzzBar value={t.net} sd={t.sd} min={0} max={60} label={`Team ${t.number} xPts`} />
                </div>

                <div className="meta-list muted">
                  <span>Matches: <strong>{t.matches}</strong></span>
                  <span>Origin: {t.city ? `${t.city}, ${t.state_prov ?? t.country}` : '—'}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Component Breakdown Table */}
          <section className="section" aria-labelledby="comp-breakdown-head">
            <div className="section-head">
              <h3 id="comp-breakdown-head">Component Strengths</h3>
              <Why
                title="Component Attribution"
                method="Per-robot points per match isolated using Bayesian regression with exact partner credit splitting. Defense is inferred from opponent scoring deficits."
                inputs={['TBA Score breakdown objects', 'Official game rule point values', 'Match schedules']}
              />
            </div>
            <div className="table-wrap">
              <table className="agate compare-table">
                <thead>
                  <tr>
                    <th>Component</th>
                    {initialTeams.map((t) => (
                      <th key={t.key} className="n">
                        #{t.number} {t.nickname ?? ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="strong">Autonomous</td>
                    {initialTeams.map((t) => (
                      <td key={t.key} className="n">
                        +{t.components.auto.mean.toFixed(1)}{' '}
                        <span className="muted">±{t.components.auto.sd.toFixed(1)}</span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="strong">Teleop</td>
                    {initialTeams.map((t) => (
                      <td key={t.key} className="n">
                        +{t.components.teleop.mean.toFixed(1)}{' '}
                        <span className="muted">±{t.components.teleop.sd.toFixed(1)}</span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="strong">Endgame</td>
                    {initialTeams.map((t) => (
                      <td key={t.key} className="n">
                        +{t.components.endgame.mean.toFixed(1)}{' '}
                        <span className="muted">±{t.components.endgame.sd.toFixed(1)}</span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="strong">Defense Suppression</td>
                    {initialTeams.map((t) => (
                      <td key={t.key} className="n">
                        {t.components.defense ? `+${t.components.defense.mean.toFixed(1)}` : '0.0'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="strong">Fouls Conceded</td>
                    {initialTeams.map((t) => (
                      <td key={t.key} className="n neg">
                        -{t.components.fouls.mean.toFixed(1)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Head-to-Head Matchup Matrix */}
          <section className="section" aria-labelledby="h2h-head">
            <div className="section-head">
              <h3 id="h2h-head">Head-to-Head Simulated Odds</h3>
              <Why
                title="Head-to-Head Simulation"
                method="Simulates a 1v1 or hypothetically matched contest with identical average partners. Calculated using normal cumulative distribution Phi(delta_net / margin_sd) with empirical match noise."
                inputs={['Team posterior means & SDs', 'Heteroscedastic season noise scale']}
              />
            </div>

            <div className="h2h-grid">
              {initialTeams.map((teamA, i) =>
                initialTeams.slice(i + 1).map((teamB) => {
                  const res = headToHead(teamA, teamB);
                  return (
                    <div key={`${teamA.key}-${teamB.key}`} className="h2h-card">
                      <div className="h2h-matchup">
                        <span className="team-a">#{teamA.number}</span>
                        <span className="muted">vs</span>
                        <span className="team-b">#{teamB.number}</span>
                      </div>
                      <div className="h2h-bar">
                        <div className="h2h-fill a" style={{ width: `${res.pA}%` }}>
                          {res.pA}%
                        </div>
                        <div className="h2h-fill b" style={{ width: `${res.pB}%` }}>
                          {res.pB}%
                        </div>
                      </div>
                      <div className="h2h-footer muted">
                        <span>Expected margin: {res.margin >= 0 ? `+${res.margin.toFixed(1)}` : res.margin.toFixed(1)} pts for #{teamA.number}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
