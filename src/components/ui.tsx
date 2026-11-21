'use client';

// Small interactive primitives: logo (with easter egg), calm toggle, "?" tooltip, count-up number, toaster.

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addToPicklist, getMyTeam, getPicklist, motionOk, setCalm, setMyTeam, setPicklist, toast } from '@/lib/fx';

/** Original mark: a "1" with a dot on its orbit. Five quick clicks (or the Konami code) engage warp (an easter egg). */
export function Logo() {
  const clicks = useRef<number[]>([]);
  useEffect(() => {
    const seq = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let i = 0;
    const onKey = (e: KeyboardEvent) => {
      i = e.key === seq[i] ? i + 1 : e.key === seq[0] ? 1 : 0;
      if (i === seq.length) {
        i = 0;
        warp();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const onClick = (e: React.MouseEvent) => {
    const now = Date.now();
    clicks.current = [...clicks.current.filter((t) => now - t < 1500), now];
    if (clicks.current.length >= 5) {
      e.preventDefault();
      clicks.current = [];
      warp();
    }
  };
  return (
    <svg className="logo" viewBox="0 0 32 32" aria-hidden onClick={onClick}>
      <ellipse cx="16" cy="16" rx="13" ry="7" transform="rotate(-25 16 16)" fill="none" stroke="rgba(63,230,255,.45)" strokeWidth="1" />
      <path d="M13.2 10.4 17 8v16M13 24h8" fill="none" stroke="#eceef1" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="4.2" cy="19.6" r="2" fill="#3fe6ff" />
    </svg>
  );
}

function warp() {
  const html = document.documentElement;
  if (!motionOk()) return toast('Warp drive needs Calm mode off');
  html.setAttribute('data-warp', '');
  toast('Warp speed engaged');
  setTimeout(() => html.removeAttribute('data-warp'), 1700);
}

export function useCalm() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(document.documentElement.hasAttribute('data-calm'));
    sync();
    window.addEventListener('ot:calm', sync);
    return () => window.removeEventListener('ot:calm', sync);
  }, []);
  return on;
}

export function CalmToggle({ className = 'calm-toggle', children = 'Calm mode' }: { className?: string; children?: React.ReactNode }) {
  const on = useCalm();
  return (
    <button type="button" role="switch" aria-checked={on} className={className} onClick={() => setCalm(!on)}>
      {children}
      <span className="switch" aria-hidden />
    </button>
  );
}

/** Pins this team's row in tables and marks its star in the galaxy. */
export function MyTeamButton({ team }: { team: string }) {
  const router = useRouter();
  const [mine, setMine] = useState(false);
  useEffect(() => {
    const sync = () => setMine(getMyTeam() === team);
    sync();
    window.addEventListener('ot:myteam', sync);
    return () => window.removeEventListener('ot:myteam', sync);
  }, [team]);
  return (
    <button
      type="button"
      className="ghost"
      aria-pressed={mine}
      onClick={() => {
        setMyTeam(mine ? null : team);
        toast(mine ? 'Unpinned' : `${team.slice(3)} is your team`);
        router.refresh();
      }}
    >
      {mine ? 'My team ✓' : 'Make my team'}
    </button>
  );
}

/** A tiny "?" with a one-line explanation, on hover, focus or tap. */
export function Tip({ children, label = 'What is this?', align }: { children: React.ReactNode; label?: string; align?: 'right' }) {
  const id = useId();
  return (
    <span className={`tip${align ? ` ${align}` : ''}`}>
      <button type="button" aria-label={label} aria-describedby={id}>
        ?
      </button>
      <span role="tooltip" id={id}>
        {children}
      </span>
    </span>
  );
}

export function Toaster() {
  const [items, setItems] = useState<{ id: number; text: string }[]>([]);
  useEffect(() => {
    let n = 0;
    const on = (e: Event) => {
      const id = ++n;
      setItems((xs) => [...xs.slice(-2), { id, text: String((e as CustomEvent).detail) }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 2600);
    };
    window.addEventListener('ot:toast', on);
    return () => window.removeEventListener('ot:toast', on);
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function PicklistButton({ team, year }: { team: string; year: number }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(getPicklist(year).includes(team));
    sync();
    window.addEventListener('ot:picklist', sync);
    return () => window.removeEventListener('ot:picklist', sync);
  }, [team, year]);
  return (
    <button
      type="button"
      className={on ? 'ghost' : undefined}
      aria-pressed={on}
      onClick={() => {
        const n = team.slice(3);
        if (on) {
          setPicklist(year, getPicklist(year).filter((t) => t !== team));
          toast(`${n} removed from picklist`);
        } else {
          addToPicklist(year, team);
          toast(`${n} added to your picklist`);
        }
      }}
    >
      {on ? 'On picklist' : 'Add to picklist'}
    </button>
  );
}
