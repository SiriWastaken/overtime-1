'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { gaussian, rng } from '@/engine/stats';
import { Mascot } from './Mascot';

export interface McMatch {
  key: string;
  label: string;
  event: string;
  red: number[];
  blue: number[];
  /** Frozen pre-match forecast: red − blue margin, its sd, and red's win chance. */
  margin: number;
  marginSd: number;
  redWinProb: number;
  redScore: number;
  blueScore: number;
}

const DRAWS = 120;
const BINS = 21;
const W = 640;
const H = 260;
const PAD = { l: 16, r: 16, t: 16, b: 40 };
const R = 4.5;

/**
 * The lab's signature: replay a real match's frozen pre-match forecast as simulated outcomes. Dots drop and stack into
 * the distribution; the real final margin is highlighted against it. Sampling is honest: draws come from the stored
 * forecast (normal margin with its sd), nothing else.
 */
export function MonteCarlo({ matches }: { matches: McMatch[] }) {
  const [i, setI] = useState(0);
  const [run, setRun] = useState(1);
  const m = matches[i];

  const sim = useMemo(() => {
    if (!m) return null;
    const g = gaussian(rng(run * 7919 + i));
    const draws = Array.from({ length: DRAWS }, () => m.margin + m.marginSd * g());
    const span = Math.max(Math.abs(m.margin) + 3 * m.marginSd, Math.abs(m.redScore - m.blueScore) + 10);
    const lo = -span;
    const w = (2 * span) / BINS;
    const bin = (v: number) => Math.min(BINS - 1, Math.max(0, Math.floor((v - lo) / w)));
    const counts = new Array(BINS).fill(0);
    const dots = draws.map((v, k) => ({ k, b: bin(v), level: counts[bin(v)]++, red: v > 0 }));
    return { lo, span, w, counts, dots, redWins: draws.filter((v) => v > 0).length };
  }, [m, run, i]);

  if (!m || !sim) return null;
  const real = m.redScore - m.blueScore;
  const x = (v: number) => PAD.l + ((v - sim.lo) / (2 * sim.span)) * (W - PAD.l - PAD.r);
  const colW = (W - PAD.l - PAD.r) / BINS;
  const fav = m.redWinProb >= 0.5 ? 'Red' : 'Blue';
  const upset = real !== 0 && (real > 0) !== m.redWinProb >= 0.5;
  const pctFav = Math.round((m.redWinProb >= 0.5 ? m.redWinProb : 1 - m.redWinProb) * 100);
  const winner = real > 0 ? 'Red' : real < 0 ? 'Blue' : 'Nobody';

  return (
    <figure className="mc card">
      <figcaption className="mc-head">
        <div>
          <h2>Model vs reality</h2>
          <p className="mc-match">
            <Link href={`/matches/${m.key}`}>{m.label}</Link> · {m.event} · <span className="mc-red">{m.red.join(' ')}</span> vs{' '}
            <span className="mc-blue">{m.blue.join(' ')}</span>
          </p>
        </div>
        <Mascot mood={upset ? 'oops' : 'happy'} size={56} />
      </figcaption>

      <svg
        key={`${i}-${run}`}
        className="mc-plot"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${DRAWS} simulated outcomes from the model's pre-match forecast: ${fav} favoured at ${pctFav}%, red won ${sim.redWins} of ${DRAWS} draws. Real result: ${winner} by ${Math.abs(real)}.`}
      >
        <line x1={x(0)} x2={x(0)} y1={PAD.t} y2={H - PAD.b} className="mc-zero" />
        <text x={x(0) - 8} y={H - 14} textAnchor="end" className="mc-side">
          ← Blue wins
        </text>
        <text x={x(0) + 8} y={H - 14} className="mc-side">
          Red wins →
        </text>
        {sim.dots.map((d) => (
          <circle
            key={d.k}
            className={d.red ? 'mc-dot red' : 'mc-dot blue'}
            cx={PAD.l + (d.b + 0.5) * colW}
            cy={H - PAD.b - R - 1 - d.level * (2 * R + 1)}
            r={R}
            style={{ ['--k' as string]: d.k }}
          />
        ))}
        <g className="mc-real">
          <line x1={x(real)} x2={x(real)} y1={PAD.t + 8} y2={H - PAD.b} />
          {/* the label stays inside the plot even when the real margin sits at an edge */}
          <g transform={`translate(${Math.min(Math.max(x(real), PAD.l + 50), W - PAD.r - 50)},0)`}>
            <rect x={-48} y={0} width={96} height={22} rx={11} />
            <text y={15} textAnchor="middle">
              Real: {real === 0 ? 'tie' : `${winner} +${Math.abs(real)}`}
            </text>
          </g>
        </g>
      </svg>

      <p className="mc-read">
        The model gave {fav} <b>{pctFav}%</b>. In {DRAWS} replays, red won <b>{sim.redWins}</b>. {upset ? 'Then reality went the other way. It happens.' : 'Reality agreed this time.'}
      </p>
      <div className="mc-ctl">
        <button type="button" onClick={() => setRun((r) => r + 1)}>
          Run it again
        </button>
        {matches.length > 1 ? (
          <button type="button" className="ghost" onClick={() => setI((k) => (k + 1) % matches.length)}>
            Another match
          </button>
        ) : null}
        <details className="mc-table">
          <summary>As a table</summary>
          <table className="agate">
            <thead>
              <tr>
                <th scope="col">Margin (red − blue)</th>
                <th scope="col" className="n">
                  Draws
                </th>
              </tr>
            </thead>
            <tbody>
              {sim.counts.map((c, b) =>
                c ? (
                  <tr key={b}>
                    <td>
                      {Math.round(sim.lo + b * sim.w)} to {Math.round(sim.lo + (b + 1) * sim.w)}
                    </td>
                    <td className="n">{c}</td>
                  </tr>
                ) : null
              )}
            </tbody>
          </table>
        </details>
      </div>
    </figure>
  );
}
