import { MIN_RELIABLE_MATCHES } from '@/engine/edge';

/** EDGE as signed percentage points, e.g. "+18" or "−4". */
export function edgePts(e: number, digits = 0) {
  const v = Number((e * 100).toFixed(digits));
  if (v === 0) return (0).toFixed(digits);
  return `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)}`;
}

/** Every gauge shares one scale: −60 to +60 points, median robot at the centre. */
const DOMAIN = 0.6;
const clamp = (v: number) => Math.min(Math.max(v / DOMAIN, -1), 1);

/** Glow is reserved for the season's top 10 by EDGE (rank-based, so it means the same thing every season). */
export const hot = (rank: number | null | undefined) => (rank != null && rank <= 10 ? ' hot' : '');

/**
 * The one way EDGE is shown: a diverging bar centred at zero (left hurts, right helps), the number beside it,
 * and an optional 80% bracket. A change in value animates the fill (cause and effect); first paint does not.
 */
export function EdgeGauge({
  edge,
  lo,
  hi,
  matches,
  size = 'sm',
  digits = 0,
}: {
  edge: number | null | undefined;
  lo?: number;
  hi?: number;
  matches?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  digits?: number;
}) {
  if (edge === null || edge === undefined)
    return (
      <span className={`gauge g-${size} none`}>
        <span className="g-num">—</span>
      </span>
    );
  const pos = (v: number) => `${(clamp(v) + 1) * 50}%`;
  const early = matches !== undefined && matches < MIN_RELIABLE_MATCHES;
  const word = edge > 0.005 ? 'helps' : edge < -0.005 ? 'hurts' : 'neutral';
  return (
    <span className={`gauge g-${size}${edge < 0 ? ' neg' : ''}${early ? ' early' : ''}`} role="img" aria-label={`EDGE ${edgePts(edge, digits)}, ${word}${early ? ', early estimate' : ''}`}>
      <span className="g-track" aria-hidden>
        {lo !== undefined && hi !== undefined ? <i className="g-ci" style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` }} /> : null}
        <i className="g-fill" style={{ ['--v' as string]: clamp(edge).toFixed(3) }} />
      </span>
      <b className="g-num" aria-hidden>
        {edgePts(edge, digits)}
      </b>
    </span>
  );
}
