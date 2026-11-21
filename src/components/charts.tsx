// Hand-built SVG charts: real axes, labelled units, shared scales where a set is compared.

const W = 640;

function ticks(lo: number, hi: number, n = 5): number[] {
  const span = hi - lo || 1;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

const HatchDef = ({ id }: { id: string }) => (
  <defs>
    <pattern id={id} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="4" height="4" fill="rgba(255,255,255,0.04)" />
      <line x1="0" y1="0" x2="0" y2="4" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
    </pattern>
  </defs>
);

export interface SeriesPoint {
  t: number;
  mean: number;
  sd: number;
  event: string;
}

/** Rating progression: mean line with a hatched 80% band; events separated by labelled ticks. */
export function RatingChart({ points, yMax, yLabel = 'Points added per match' }: { points: SeriesPoint[]; yMax?: number; yLabel?: string }) {
  if (points.length < 2) return <p className="muted">Not enough matches for a progression chart.</p>;
  const H = 220;
  const m = { l: 44, r: 12, t: 12, b: 34 };
  const lo = Math.min(0, ...points.map((p) => p.mean - 1.28 * p.sd));
  const hi = yMax ?? Math.max(...points.map((p) => p.mean + 1.28 * p.sd));
  const x = (i: number) => m.l + (i / (points.length - 1)) * (W - m.l - m.r);
  const y = (v: number) => m.t + (1 - (v - lo) / (hi - lo || 1)) * (H - m.t - m.b);
  const band = points.map((p, i) => `${x(i)},${y(p.mean + 1.28 * p.sd)}`).join(' ') + ' ' + [...points].reverse().map((p, k) => `${x(points.length - 1 - k)},${y(p.mean - 1.28 * p.sd)}`).join(' ');
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.mean)}`).join(' ');
  const breaks = points.map((p, i) => (i === 0 || p.event !== points[i - 1].event ? i : -1)).filter((i) => i >= 0);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Rating progression with 80% uncertainty band">
      <HatchDef id="rc-hatch" />
      <g className="grid">
        {ticks(lo, hi).map((v) => (
          <line key={v} x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} />
        ))}
      </g>
      <polygon points={band} fill="url(#rc-hatch)" opacity="0.9" />
      <path d={line} fill="none" stroke="var(--chart-ink)" strokeWidth="1.75" />
      {breaks.map((i) => (
        <g key={i}>
          <line x1={x(i)} x2={x(i)} y1={m.t} y2={H - m.b} stroke="var(--text-3)" strokeDasharray="2 3" />
          <text x={x(i) + 3} y={H - m.b + 14} className="label">
            {points[i].event.slice(4).toUpperCase()}
          </text>
        </g>
      ))}
      <g className="axis">
        <line x1={m.l} x2={m.l} y1={m.t} y2={H - m.b} />
        {ticks(lo, hi).map((v) => (
          <text key={v} x={m.l - 6} y={y(v) + 3} textAnchor="end">
            {v}
          </text>
        ))}
      </g>
      <text x={m.l} y={H - 4} className="label">
        Matches played →
      </text>
      <text transform={`translate(10 ${m.t + (H - m.t - m.b) / 2}) rotate(-90)`} textAnchor="middle" className="label">
        {yLabel}
      </text>
    </svg>
  );
}

/** Histogram with an optional highlighted value. */
export function Histogram({ values, highlight, xLabel, bins = 30, lo: lo0, hi: hi0, height = 170, width = W }: { values: number[]; highlight?: number; xLabel: string; bins?: number; lo?: number; hi?: number; height?: number; width?: number }) {
  if (values.length === 0) return <p className="muted">No data.</p>;
  const H = height;
  const m = { l: 40, r: 12, t: 8, b: 32 };
  const lo = lo0 ?? Math.min(...values);
  const hi = hi0 ?? Math.max(...values);
  const w = (hi - lo) / bins || 1;
  const counts = new Array(bins).fill(0);
  for (const v of values) counts[Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / w)))]++;
  const cmax = Math.max(...counts);
  const x = (v: number) => m.l + ((v - lo) / (hi - lo || 1)) * (width - m.l - m.r);
  const y = (c: number) => m.t + (1 - c / cmax) * (H - m.t - m.b);
  return (
    <svg className="chart" viewBox={`0 0 ${width} ${H}`} role="img" aria-label={`Distribution of ${xLabel}`}>
      {counts.map((c, i) => (
        <rect key={i} x={x(lo + i * w) + 0.5} width={Math.max(x(lo + (i + 1) * w) - x(lo + i * w) - 1, 0.5)} y={y(c)} height={H - m.b - y(c)} fill={highlight !== undefined && highlight >= lo + i * w && highlight < lo + (i + 1) * w ? 'var(--text)' : 'var(--line-3)'} />
      ))}
      {highlight !== undefined ? <line x1={x(highlight)} x2={x(highlight)} y1={m.t} y2={H - m.b} stroke="var(--text)" strokeWidth="1.5" /> : null}
      <g className="axis">
        <line x1={m.l} x2={width - m.r} y1={H - m.b} y2={H - m.b} />
        {ticks(lo, hi, width < W ? 5 : 8).map((v) => (
          <text key={v} x={x(v)} y={H - m.b + 13} textAnchor="middle">
            {v}
          </text>
        ))}
        {ticks(0, cmax, 3).map((c) => (
          <text key={c} x={m.l - 6} y={y(c) + 3} textAnchor="end">
            {c}
          </text>
        ))}
      </g>
      <text x={width - m.r} y={H - 3} textAnchor="end" className="label">
        {xLabel}
      </text>
    </svg>
  );
}

/** Reliability diagram: predicted win probability vs observed frequency, marker area ∝ matches. */
export function Calibration({ bins }: { bins: { lo: number; hi: number; n: number; meanPred: number; observed: number }[] }) {
  const S = 300;
  const m = { l: 40, r: 10, t: 10, b: 36 };
  const x = (p: number) => m.l + p * (S - m.l - m.r);
  const y = (p: number) => m.t + (1 - p) * (S - m.t - m.b);
  const nmax = Math.max(1, ...bins.map((b) => b.n));
  const pts = bins.filter((b) => b.n > 0);
  return (
    <svg className="chart" viewBox={`0 0 ${S} ${S}`} style={{ maxWidth: 360 }} role="img" aria-label="Calibration of win probabilities">
      <g className="grid">
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={x(v)} x2={x(v)} y1={m.t} y2={S - m.b} />
            <line x1={m.l} x2={S - m.r} y1={y(v)} y2={y(v)} />
          </g>
        ))}
      </g>
      <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="var(--text-3)" strokeDasharray="3 3" />
      <path d={pts.map((b, i) => `${i ? 'L' : 'M'}${x(b.meanPred)},${y(b.observed)}`).join(' ')} fill="none" stroke="var(--chart-ink)" strokeWidth="1.5" />
      {pts.map((b) => (
        <circle key={b.lo} cx={x(b.meanPred)} cy={y(b.observed)} r={2 + 6 * Math.sqrt(b.n / nmax)} fill="var(--surface)" stroke="var(--chart-ink)" strokeWidth="1.5">
          <title>{`Forecast ${Math.round(b.meanPred * 100)}%: red won ${Math.round(b.observed * 100)}% of ${b.n}`}</title>
        </circle>
      ))}
      <g className="axis">
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <text x={x(v)} y={S - m.b + 13} textAnchor="middle">
              {v * 100}%
            </text>
            <text x={m.l - 5} y={y(v) + 3} textAnchor="end">
              {v * 100}%
            </text>
          </g>
        ))}
      </g>
      <text x={(m.l + S - m.r) / 2} y={S - 4} textAnchor="middle" className="label">
        Forecast P(red wins)
      </text>
      <text transform={`translate(10 ${(m.t + S - m.b) / 2}) rotate(-90)`} textAnchor="middle" className="label">
        Observed red win rate
      </text>
    </svg>
  );
}
