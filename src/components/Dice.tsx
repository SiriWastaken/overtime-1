'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { motionOk } from '@/lib/fx';

const PIPS: Record<number, [number, number][]> = {
  1: [[16, 16]],
  2: [[10, 10], [22, 22]],
  3: [[10, 10], [16, 16], [22, 22]],
  4: [[10, 10], [22, 10], [10, 22], [22, 22]],
  5: [[10, 10], [22, 10], [16, 16], [10, 22], [22, 22]],
  6: [[10, 9], [22, 9], [10, 16], [22, 16], [10, 23], [22, 23]],
};

/** Rolls a random rated team of the season and opens its page: a way in for the curious. */
export function Dice({ year, teams }: { year: number; teams: number[] }) {
  const router = useRouter();
  const [face, setFace] = useState(5);
  const [rolling, setRolling] = useState(false);
  const roll = () => {
    if (!teams.length || rolling) return;
    const n = teams[Math.floor(Math.random() * teams.length)];
    setFace(1 + Math.floor(Math.random() * 6));
    setRolling(true);
    setTimeout(() => router.push(`/teams/${n}?year=${year}`), motionOk() ? 650 : 0);
  };
  return (
    <button type="button" className="dice" onClick={roll} disabled={!teams.length} aria-live="polite">
      <svg className={rolling ? 'dice-die rolling' : 'dice-die'} width="44" height="44" viewBox="0 0 32 32" aria-hidden>
        <rect x="2" y="2" width="28" height="28" rx="7" fill="var(--card)" stroke="var(--ink)" strokeWidth="2.5" />
        {PIPS[face].map(([x, y]) => (
          <circle key={`${x}${y}`} cx={x} cy={y} r="2.6" fill="var(--ink)" />
        ))}
      </svg>
      <span>{rolling ? 'Rolling the dice…' : 'Roll a random team'}</span>
    </button>
  );
}
