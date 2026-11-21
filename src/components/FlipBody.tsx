'use client';

import { useLayoutEffect, useRef } from 'react';
import { motionOk } from '@/lib/fx';

/**
 * <tbody> that animates row reordering (FLIP). Rows are keyed by team, so React keeps their DOM nodes when the
 * sort changes; we measure where each row was and slide it from there. Moved rows get data-move=up|down for a
 * short caret pulse. Only rows near the viewport animate, to stay cheap on long tables.
 */
export function FlipBody({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLTableSectionElement>(null);
  const prev = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const body = ref.current;
    if (!body) return;
    const rows = [...body.querySelectorAll<HTMLTableRowElement>('tr[data-peek]')];
    const now = new Map(rows.map((r) => [r.dataset.peek!, r.offsetTop]));
    if (prev.current.size && motionOk()) {
      const vh = window.innerHeight;
      for (const r of rows) {
        const before = prev.current.get(r.dataset.peek!);
        const after = now.get(r.dataset.peek!)!;
        if (before === undefined || before === after) continue;
        const top = r.getBoundingClientRect().top;
        if (top < -200 || top > vh + 200) continue;
        r.dataset.move = before > after ? 'up' : 'down';
        r.animate([{ transform: `translateY(${before - after}px)` }, { transform: 'translateY(0)' }], { duration: 420, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
        setTimeout(() => delete r.dataset.move, 1900);
      }
    }
    prev.current = now;
  });
  return (
    <tbody ref={ref} className={className}>
      {children}
    </tbody>
  );
}
