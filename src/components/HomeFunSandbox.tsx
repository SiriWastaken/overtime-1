'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { normalCdf } from '@/engine/stats';
import { Why } from './ui';

interface TeamPreset {
  key: string;
  number: number;
  nickname: string;
  net: number;
  sd: number;
}

const PRESET_ALLIANCES = [
  {
    name: 'Championship Showdown',
    red: [
      { key: 'frc1690', number: 1690, nickname: 'Orbit', net: 48.5, sd: 3.2 },
      { key: 'frc254', number: 254, nickname: 'The Cheesy Poofs', net: 45.2, sd: 3.5 },
      { key: 'frc1323', number: 1323, nickname: 'MadTown Robotics', net: 42.0, sd: 3.8 },
    ],
    blue: [
      { key: 'frc2056', number: 2056, nickname: 'OP Robotics', net: 46.1, sd: 3.4 },
      { key: 'frc971', number: 971, nickname: 'Spartan Robotics', net: 43.8, sd: 3.6 },
      { key: 'frc118', number: 118, nickname: 'The Robonauts', net: 41.5, sd: 3.9 },
    ],
  },
  {
    name: 'Offense vs Defense',
    red: [
      { key: 'frc1690', number: 1690, nickname: 'Orbit', net: 48.5, sd: 3.2 },
      { key: 'frc2910', number: 2910, nickname: 'Jack in the Bot', net: 40.5, sd: 3.9 },
      { key: 'frc4414', number: 4414, nickname: 'HighTide', net: 41.0, sd: 3.7 },
    ],
    blue: [
      { key: 'frc254', number: 254, nickname: 'The Cheesy Poofs', net: 45.2, sd: 3.5 },
      { key: 'frc2056', number: 2056, nickname: 'OP Robotics', net: 46.1, sd: 3.4 },
      { key: 'frc1678', number: 1678, nickname: 'Citrus Circuits', net: 44.0, sd: 3.5 },
    ],
  },
];

export function HomeFunSandbox({ year }: { year: number }) {
  const [presetIndex, setPresetIndex] = useState(0);
  const [redOffset, setRedOffset] = useState(0); // what-if offset for red
  const [simulating, setSimulating] = useState(false);
  const [simResults, setSimResults] = useState<{ redWins: number; total: number; meanMargin: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);

  const preset = PRESET_ALLIANCES[presetIndex];
  const redMean = preset.red.reduce((a, b) => a + b.net, 0) + redOffset;
  const blueMean = preset.blue.reduce((a, b) => a + b.net, 0);
  const redVar = preset.red.reduce((a, b) => a + b.sd * b.sd, 0);
  const blueVar = preset.blue.reduce((a, b) => a + b.sd * b.sd, 0);
  const matchNoiseSd = 18; // typical match score noise
  const marginSd = Math.sqrt(redVar + blueVar + matchNoiseSd * matchNoiseSd);
  const margin = redMean - blueMean;
  const analyticalWinProb = normalCdf(margin / marginSd);

  const runMonteCarloRain = () => {
    if (simulating) return;
    setSimulating(true);
    window.dispatchEvent(new CustomEvent('ot:simulating'));

    const canvas = canvasRef.current;
    if (!canvas) {
      setSimulating(false);
      window.dispatchEvent(new CustomEvent('ot:simulated'));
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const N_SIMS = 1600;
    const bins = new Int32Array(50);
    const minM = -80;
    const maxM = 80;
    const span = maxM - minM;

    let redWins = 0;
    let sumMargin = 0;

    // Draw grid and axis
    const drawGrid = () => {
      ctx.fillStyle = '#06080b';
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;

      // Center zero line
      const zeroX = ((0 - minM) / span) * width;
      ctx.beginPath();
      ctx.moveTo(zeroX, 0);
      ctx.lineTo(zeroX, height);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = '11px sans-serif';
      ctx.fillText('Blue +40', width * 0.25 - 20, 15);
      ctx.fillText('Tie (0)', zeroX - 16, 15);
      ctx.fillText('Red +40', width * 0.75 - 20, 15);
    };

    drawGrid();

    // Generate simulated outcomes with random Gaussian noise (Box-Muller)
    const outcomes: { x: number; y: number; finalY: number; color: string; m: number }[] = [];
    for (let i = 0; i < N_SIMS; i++) {
      const u1 = Math.max(1e-6, Math.random());
      const u2 = Math.random();
      const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      const simMargin = margin + z * marginSd;
      if (simMargin > 0) redWins++;
      sumMargin += simMargin;

      const binIdx = Math.max(0, Math.min(49, Math.floor(((simMargin - minM) / span) * 50)));
      bins[binIdx]++;

      const x = ((simMargin - minM) / span) * width;
      const count = bins[binIdx];
      const finalY = height - 12 - count * 2.8;
      const color = simMargin > 0 ? '#ef5b6c' : simMargin < 0 ? '#4f8fe8' : '#3fe6ff';
      outcomes.push({ x, y: 15, finalY, color, m: simMargin });
    }

    // Animate falling rain
    let step = 0;
    const animate = () => {
      drawGrid();

      // Draw fallen settled drops
      const batch = Math.min(N_SIMS, step * 40);
      for (let i = 0; i < batch; i++) {
        const p = outcomes[i];
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.finalY, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw currently falling drops
      for (let i = batch; i < Math.min(N_SIMS, batch + 80); i++) {
        const p = outcomes[i];
        p.y += 12;
        if (p.y < p.finalY) {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      step++;
      if (batch < N_SIMS) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        setSimulating(false);
        window.dispatchEvent(new CustomEvent('ot:simulated'));
        setSimResults({
          redWins,
          total: N_SIMS,
          meanMargin: sumMargin / N_SIMS,
        });
      }
    };

    animRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <section className="section fun-sandbox-section" aria-labelledby="fun-sandbox-head">
      <div className="section-head">
        <div>
          <h2 id="fun-sandbox-head">Signature Lab: Monte Carlo Outcome Rain</h2>
          <p className="sub">
            Simulate 1,600 hypothetical matches. Watch parameter uncertainty and score noise rain down into an empirical win distribution.
          </p>
        </div>
        <Why
          title="Monte Carlo Matchup Simulation"
          value={`Red ${Math.round(analyticalWinProb * 100)}% vs Blue ${Math.round((1 - analyticalWinProb) * 100)}%`}
          inputs={[
            `Red alliance net xPts: ${redMean.toFixed(1)} pts`,
            `Blue alliance net xPts: ${blueMean.toFixed(1)} pts`,
            `Margin parameter variance: ${(redVar + blueVar).toFixed(1)}`,
            `Empirical match noise SD: ${matchNoiseSd} pts`,
          ]}
          method="Draws team contributions from Gaussian posterior theta ~ N(mu, sd^2) and draws match innovation noise from heteroscedastic season error scale. Win probability = fraction of simulations where Red margin > 0."
          uncertainty={`Expected margin: ${margin >= 0 ? '+' : ''}${margin.toFixed(1)} pts (±${marginSd.toFixed(1)} SD, 80% CI: [${(margin - 1.28 * marginSd).toFixed(1)}, ${(margin + 1.28 * marginSd).toFixed(1)}])`}
          sampleSize={1600}
        />
      </div>

      <div className="sandbox-card">
        <div className="sandbox-top">
          <div className="sandbox-alliances">
            <div className="alliance-pod red">
              <span className="alliance-title">RED ALLIANCE</span>
              <div className="pod-teams">
                {preset.red.map((t) => (
                  <Link key={t.key} href={`/teams/${t.number}?year=${year}`} className="pod-team">
                    <span className="team-num">{t.number}</span>
                    <span className="team-name">{t.nickname}</span>
                    <span className="team-xpts">+{t.net.toFixed(1)}</span>
                  </Link>
                ))}
              </div>
              <div className="pod-summary">
                <span>Exp: {redMean.toFixed(1)} pts</span>
                <span className="pod-prob">{(analyticalWinProb * 100).toFixed(0)}% win</span>
              </div>
            </div>

            <div className="vs-badge">VS</div>

            <div className="alliance-pod blue">
              <span className="alliance-title">BLUE ALLIANCE</span>
              <div className="pod-teams">
                {preset.blue.map((t) => (
                  <Link key={t.key} href={`/teams/${t.number}?year=${year}`} className="pod-team">
                    <span className="team-num">{t.number}</span>
                    <span className="team-name">{t.nickname}</span>
                    <span className="team-xpts">+{t.net.toFixed(1)}</span>
                  </Link>
                ))}
              </div>
              <div className="pod-summary">
                <span>Exp: {blueMean.toFixed(1)} pts</span>
                <span className="pod-prob">{((1 - analyticalWinProb) * 100).toFixed(0)}% win</span>
              </div>
            </div>
          </div>

          <div className="sandbox-controls">
            <div className="preset-toggle">
              <label htmlFor="preset-select" className="muted">Matchup:</label>
              <select
                id="preset-select"
                value={presetIndex}
                onChange={(e) => {
                  setPresetIndex(Number(e.target.value));
                  setSimResults(null);
                }}
              >
                {PRESET_ALLIANCES.map((p, i) => (
                  <option key={i} value={i}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="whatif-slider-box">
              <label htmlFor="whatif-range">
                What-if Red contributes <strong className="pos">{redOffset >= 0 ? `+${redOffset}` : redOffset} pts</strong>:
              </label>
              <input
                id="whatif-range"
                type="range"
                min="-20"
                max="20"
                step="2"
                value={redOffset}
                onChange={(e) => {
                  setRedOffset(Number(e.target.value));
                  setSimResults(null);
                }}
              />
            </div>

            <button
              type="button"
              className="button primary rain-btn"
              onClick={runMonteCarloRain}
              disabled={simulating}
            >
              {simulating ? 'Simulating 1,600 matches…' : 'Run Monte Carlo Rain ⚡'}
            </button>
          </div>
        </div>

        <div className="sandbox-canvas-wrap">
          <canvas ref={canvasRef} width={760} height={180} className="rain-canvas" />
          {simResults ? (
            <div className="sim-badge-overlay">
              <span>Simulated: Red <strong>{((simResults.redWins / simResults.total) * 100).toFixed(1)}%</strong> ({simResults.redWins}/{simResults.total})</span>
              <span>Mean margin: <strong>{simResults.meanMargin >= 0 ? '+' : ''}{simResults.meanMargin.toFixed(1)} pts</strong></span>
            </div>
          ) : (
            <div className="sim-hint-overlay">
              <span>Click “Run Monte Carlo Rain” to watch 1,600 match outcomes drop into this distribution</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
