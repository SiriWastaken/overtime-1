'use client';

import { useEffect, useRef, useState } from 'react';
import { motionOk } from '@/lib/fx';

export interface Side {
  mean: number;
  lo80: number;
  hi80: number;
}

// Never show 100%: the model is never certain (matches lib/format pct).
const winPct = (p: number) => (p > 0.995 ? '>99%' : p < 0.005 ? '<1%' : `${Math.round(p * 100)}%`);

/**
 * Tug-of-war for the win: each side's colour holds its share of the rope. The knot moves on a damped spring and flags the
 * swing ("Red +12") whenever the odds shift. Calm / reduced motion: the knot jumps.
 */
export function Tug({ redP, red, blue, busy = false, idle = 'Fill both sides' }: { redP: number | null; red?: Side; blue?: Side; busy?: boolean; idle?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 0.5, v: 0 });
  const raf = useRef(0);
  const last = useRef<number | null>(null);
  const [swing, setSwing] = useState<{ side: 'red' | 'blue'; pts: number; id: number } | null>(null);

  useEffect(() => {
    const target = redP === null ? 0.5 : redP; // red's share of the rope, from the left
    if (redP !== null && last.current !== null) {
      const d = Math.round((redP - last.current) * 100);
      if (d) setSwing({ side: d > 0 ? 'red' : 'blue', pts: Math.abs(d), id: Date.now() });
    }
    last.current = redP;
    const set = (x: number) => el.current?.style.setProperty('--x', x.toFixed(4));
    cancelAnimationFrame(raf.current);
    if (!motionOk()) {
      pos.current = { x: target, v: 0 };
      return set(target);
    }
    let t0 = performance.now();
    const step = (t: number) => {
      const dt = Math.min((t - t0) / 1000, 0.032);
      t0 = t;
      const p = pos.current;
      // under-damped spring: overshoots a little, settles in ~0.8s
      p.v += (-170 * (p.x - target) - 13 * p.v) * dt;
      p.x += p.v * dt;
      set(p.x);
      if (Math.abs(p.x - target) > 0.0005 || Math.abs(p.v) > 0.001) raf.current = requestAnimationFrame(step);
      else set(target);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [redP]);

  const live = redP !== null;
  return (
    <div className={`tug${live ? '' : ' idle'}${busy ? ' busy' : ''}`} ref={el} role="group" aria-label="Win chance">
      <div className="tug-ends">
        <span className="red-t">
          <b>{live ? winPct(redP) : '—'}</b> Red
        </span>
        <span className="tug-mid" aria-live="polite">
          {live ? (redP >= 0.5 ? 'Red pulling' : 'Blue pulling') : idle}
        </span>
        <span className="blue-t">
          Blue <b>{live ? winPct(1 - redP) : '—'}</b>
        </span>
      </div>
      <div className="rope" aria-hidden>
        <i className="rope-red" />
        <i className="rope-blue" />
        <span className="knot-track">
          <span className="knot" />
          {swing ? (
            <span key={swing.id} className={`swing ${swing.side}`}>
              {swing.side === 'red' ? 'Red' : 'Blue'} +{swing.pts}
            </span>
          ) : null}
        </span>
      </div>
      {live && red && blue ? (
        <div className="tug-scores">
          <span>
            <b>{Math.round(red.mean)}</b> {Math.max(0, Math.round(red.lo80))}–{Math.round(red.hi80)} pts
          </span>
          <span>
            {Math.max(0, Math.round(blue.lo80))}–{Math.round(blue.hi80)} pts <b>{Math.round(blue.mean)}</b>
          </span>
        </div>
      ) : null}
    </div>
  );
}
