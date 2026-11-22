'use client';

import { useEffect, useRef } from 'react';
import { motionOk } from '@/lib/fx';
import { Mascot } from './Mascot';

/** A real milestone (the team won its latest event): mascot, one line, and a single confetti burst per session. */
export function Celebrate({ id, children }: { id: string; children: React.ReactNode }) {
  const el = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const k = `ot:cheered:${id}`;
    if (!motionOk() || sessionStorage.getItem(k) || !el.current) return;
    sessionStorage.setItem(k, '1');
    const target = el.current;
    import('@/lib/confetti').then((m) => m.burst(target));
  }, [id]);
  return (
    <p className="celebrate" ref={el}>
      <Mascot mood="happy" size={40} />
      <span>{children}</span>
    </p>
  );
}
