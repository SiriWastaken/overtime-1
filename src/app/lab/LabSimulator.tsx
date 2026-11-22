'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/bits';
import { Why } from '@/components/ui';

interface SimTeam {
  team: string;
  number: number;
  nickname: string;
  net: number;
  sd: number;
  tweak: number; // user tweak in points
}

interface SimResult {
  team: string;
  number: number;
  nickname: string;
  meanRank: number;
  top1Prob: number;
  top8Prob: number;
  expectedRp: number;
  rankDist: number[]; // 0..N-1
}

const WORKER_SCRIPT = `
self.onmessage = function(e) {
  const { teams, nSims, seed } = e.data;
  const N = teams.length;
  let s = seed || 42;
  function rand() {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  }
  function randn() {
    const u1 = Math.max(1e-6, rand());
    const u2 = rand();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  }

  // Pre-generate a 10-match qualification round schedule
  const matchesPerTeam = 10;
  const totalMatches = Math.ceil((N * matchesPerTeam) / 6);
  const schedule = [];
  const pool = [];
  for (let m = 0; m < totalMatches; m++) {
    // Pick 6 random teams
    const shuf = teams.map((_, i) => i).sort(() => rand() - 0.5);
    schedule.push({ red: shuf.slice(0, 3), blue: shuf.slice(3, 6) });
  }

  const rankCounts = Array.from({ length: N }, () => new Int32Array(N));
  const rpSums = new Float64Array(N);

  const BATCH = 500;
  let done = 0;

  function runBatch() {
    const limit = Math.min(nSims, done + BATCH);
    for (let sim = done; sim < limit; sim++) {
      const rp = new Float64Array(N);
      for (const m of schedule) {
        // Red score
        let rMean = 0;
        let bMean = 0;
        for (const idx of m.red) {
          const t = teams[idx];
          rMean += t.net + t.tweak + randn() * t.sd;
        }
        for (const idx of m.blue) {
          const t = teams[idx];
          bMean += t.net + t.tweak + randn() * t.sd;
        }
        rMean += randn() * 16;
        bMean += randn() * 16;

        let rRp = rMean > bMean ? 3 : rMean === bMean ? 1 : 0;
        let bRp = bMean > rMean ? 3 : rMean === bMean ? 1 : 0;
        if (rMean > 75) rRp++;
        if (bMean > 75) bRp++;

        for (const idx of m.red) rp[idx] += rRp;
        for (const idx of m.blue) rp[idx] += bRp;
      }

      // Rank order
      const order = Array.from({ length: N }, (_, i) => i)
        .sort((a, b) => rp[b] - rp[a] || (rand() - 0.5));

      for (let r = 0; r < N; r++) {
        const teamIdx = order[r];
        rankCounts[teamIdx][r]++;
      }
      for (let i = 0; i < N; i++) rpSums[i] += rp[i];
    }

    done = limit;
    const progress = done / nSims;

    // Send intermediate progress
    const results = teams.map((t, i) => {
      let sumRank = 0;
      const dist = [];
      for (let r = 0; r < N; r++) {
        const p = rankCounts[i][r] / done;
        dist.push(p);
        sumRank += p * (r + 1);
      }
      return {
        team: t.team,
        number: t.number,
        nickname: t.nickname,
        meanRank: sumRank,
        top1Prob: dist[0],
        top8Prob: dist.slice(0, 8).reduce((a, b) => a + b, 0),
        expectedRp: rpSums[i] / done,
        rankDist: dist,
      };
    }).sort((a, b) => a.meanRank - b.meanRank);

    self.postMessage({ progress, done, total: nSims, results });

    if (done < nSims) {
      setTimeout(runBatch, 0);
    }
  }

  runBatch();
};
`;

export function LabSimulator({
  year,
  initialTeams,
}: {
  year: number;
  initialTeams: { key: string; number: number; nickname: string; net: number; sd: number }[];
}) {
  const [teams, setTeams] = useState<SimTeam[]>(() =>
    initialTeams.slice(0, 24).map((t) => ({ ...t, tweak: 0, team: t.key }))
  );
  const [simulating, setSimulating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<SimResult[] | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const handleTweakChange = (index: number, val: number) => {
    setTeams((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], tweak: val };
      return copy;
    });
  };

  const runSimulation = () => {
    if (simulating) return;
    setSimulating(true);
    setProgress(0);
    window.dispatchEvent(new CustomEvent('ot:simulating'));

    if (workerRef.current) {
      workerRef.current.terminate();
    }

    const blob = new Blob([WORKER_SCRIPT], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { progress: p, done, total, results: res } = e.data;
      setProgress(p);
      setResults(res);
      if (done >= total) {
        setSimulating(false);
        window.dispatchEvent(new CustomEvent('ot:simulated'));
      }
    };

    worker.postMessage({
      teams,
      nSims: 4000,
      seed: Date.now() % 100000,
    });
  };

  useEffect(() => {
    return () => {
      if (workerRef.current) workerRef.current.terminate();
    };
  }, []);

  return (
    <div className="lab-simulator-panel">
      <div className="section-head">
        <div>
          <h3>Interactive Monte Carlo Simulator</h3>
          <p className="sub">
            Tweak team strengths with what-if sliders. Runs 4,000 schedule simulations in a Web Worker to project final seedings and qualification odds.
          </p>
        </div>
        <div className="sim-actions">
          <button
            type="button"
            className="button primary"
            onClick={runSimulation}
            disabled={simulating}
          >
            {simulating ? `Computing... (${Math.round(progress * 100)}%)` : 'Run Monte Carlo (4,000 Sims) ⚡'}
          </button>
        </div>
      </div>

      {simulating ? (
        <div className="progress-bar-wrap">
          <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      ) : null}

      <div className="lab-grid-layout">
        {/* Teams & What-If Tweak Sliders */}
        <div className="tweaks-column">
          <div className="column-head">
            <h4>Roster &amp; Strength Adjustments</h4>
            <span className="muted">{teams.length} Teams</span>
          </div>

          <div className="tweaks-list">
            {teams.map((t, idx) => (
              <div key={t.team} className="tweak-item">
                <div className="tweak-info">
                  <Avatar team={t.number} year={year} size={22} />
                  <span className="tweak-num">#{t.number}</span>
                  <span className="tweak-name muted hide-s">{t.nickname}</span>
                  <span className="tweak-base">Base: +{t.net.toFixed(1)}</span>
                </div>
                <div className="tweak-control">
                  <input
                    type="range"
                    min="-15"
                    max="15"
                    step="1"
                    value={t.tweak}
                    onChange={(e) => handleTweakChange(idx, Number(e.target.value))}
                    aria-label={`Adjust team ${t.number} rating`}
                  />
                  <span className={`tweak-val${t.tweak > 0 ? ' pos' : t.tweak < 0 ? ' neg' : ''}`}>
                    {t.tweak > 0 ? `+${t.tweak}` : t.tweak}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Results / Simulated Outcomes */}
        <div className="results-column">
          <div className="column-head">
            <h4>Simulated Ranking Probabilities</h4>
            {results ? (
              <span className="muted">Based on {teams.length} teams · 10 matches each</span>
            ) : null}
          </div>

          {results ? (
            <div className="table-wrap">
              <table className="agate">
                <thead>
                  <tr>
                    <th>Team</th>
                    <th className="n">Exp Rank</th>
                    <th className="n">Rank 1%</th>
                    <th className="n">Top 8%</th>
                    <th className="n">Exp RP</th>
                  </tr>
                </thead>
                <tbody>
                  {results.slice(0, 16).map((r, i) => (
                    <tr key={r.team}>
                      <td>
                        <Link href={`/teams/${r.number}?year=${year}`} className="team-link">
                          <Avatar team={r.number} year={year} size={18} />
                          <span className="strong">#{r.number}</span>
                          <span className="muted hide-s">{r.nickname}</span>
                        </Link>
                      </td>
                      <td className="n strong">#{r.meanRank.toFixed(1)}</td>
                      <td className="n">
                        {r.top1Prob > 0.005 ? `${(r.top1Prob * 100).toFixed(0)}%` : '<1%'}
                      </td>
                      <td className="n pos strong">
                        {(r.top8Prob * 100).toFixed(0)}%
                      </td>
                      <td className="n">{r.expectedRp.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-panel">
              <p>Adjust any team ratings on the left, then click <strong>Run Monte Carlo</strong> to generate full ranking distributions.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
