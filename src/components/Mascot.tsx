/**
 * The lab's mascot: a little sunshine planet with its own moon (the logo's orbit). Lives only in empty, loading,
 * success and 404 states, and next to the Monte Carlo run it reacts to. Decorative: always aria-hidden.
 */
export type Mood = 'idle' | 'think' | 'happy' | 'oops';

const MOUTH: Record<Mood, string> = {
  idle: 'M26 40q6 4 12 0',
  think: 'M27 41h10',
  happy: 'M24 38q8 9 16 0z',
  oops: 'M32 39a3 3 0 1 0 .01 0',
};

export function Mascot({ mood = 'idle', size = 64 }: { mood?: Mood; size?: number }) {
  return (
    <svg className={`mascot m-${mood}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <ellipse cx="32" cy="34" rx="29" ry="9" transform="rotate(-18 32 34)" fill="none" stroke="var(--ink)" strokeWidth="2" strokeDasharray="3 4" />
      <circle cx="32" cy="34" r="19" fill="var(--sun)" stroke="var(--ink-on-fill)" strokeWidth="2.5" />
      <g className="mascot-eyes" fill="var(--ink-on-fill)">
        <circle cx="25.5" cy={mood === 'think' ? 29 : 31} r="2.4" />
        <circle cx="38.5" cy={mood === 'think' ? 29 : 31} r="2.4" />
      </g>
      <path d={MOUTH[mood]} fill={mood === 'happy' ? 'var(--ink-on-fill)' : 'none'} stroke="var(--ink-on-fill)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle className="mascot-moon" cx="58" cy="25" r="4" fill="var(--d-pink)" stroke="var(--ink-on-fill)" strokeWidth="2" />
    </svg>
  );
}
