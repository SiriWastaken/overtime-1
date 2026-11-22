'use client';

// Small interactive primitives: logo, "?" tooltip, "Why" popovers, uncertainty fuzz, toaster.

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addToPicklist, getMyTeam, getPicklist, motionOk, setCalm, setMyTeam, setPicklist, toast } from '@/lib/fx';

/** Original mark: a "1" with a dot on its orbit. Speeds up when simulations run. */
export function Logo({ simulating }: { simulating?: boolean }) {
  const [active, setActive] = useState(Boolean(simulating));

  useEffect(() => {
    const onStart = () => setActive(true);
    const onStop = () => setActive(false);
    window.addEventListener('ot:simulating', onStart);
    window.addEventListener('ot:simulated', onStop);
    return () => {
      window.removeEventListener('ot:simulating', onStart);
      window.removeEventListener('ot:simulated', onStop);
    };
  }, []);

  return (
    <svg className={`logo${active ? ' simulating' : ''}`} viewBox="0 0 32 32" aria-hidden>
      <g className="logo-orbit-group">
        <ellipse cx="16" cy="16" rx="13" ry="7" transform="rotate(-25 16 16)" fill="none" stroke="var(--line-2)" strokeWidth="1" />
        <circle className="logo-dot" cx="4.2" cy="19.6" r="2.2" fill="var(--accent)" />
      </g>
      <path d="M13.2 10.4 17 8v16M13 24h8" fill="none" stroke="var(--text)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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
      className="link"
      aria-pressed={mine}
      onClick={() => {
        setMyTeam(mine ? null : team);
        toast(mine ? 'Unpinned.' : `${team.slice(3)} is your team. It starts as captain.`);
        router.refresh();
      }}
    >
      {mine ? 'Your team · Unpin' : 'This is my team'}
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

/**
 * "Why" popover: Show your work with inputs, method, and uncertainty.
 * Every rating, prediction, and metric provides access to its underlying derivation.
 */
export function Why({
  title,
  value,
  inputs,
  method,
  uncertainty,
  sampleSize,
  align = 'right',
}: {
  title: string;
  value?: string | number;
  inputs?: string[];
  method: string;
  uncertainty?: string;
  sampleSize?: number | string;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span className={`why-wrap ${align}`}>
      <button
        type="button"
        className="why-btn"
        aria-label={`Why: ${title}`}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        why
      </button>
      {open ? (
        <>
          <div
            className="why-backdrop"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div className="why-card" role="dialog" aria-modal="false" id={id} onClick={(e) => e.stopPropagation()}>
            <div className="why-header">
              <span className="why-title">{title}</span>
              {value !== undefined ? <span className="why-val">{value}</span> : null}
              <button
                type="button"
                className="why-close"
                onClick={() => setOpen(false)}
                aria-label="Close explanation"
              >
                ✕
              </button>
            </div>
            <div className="why-body">
              {inputs && inputs.length > 0 ? (
                <div className="why-section">
                  <span className="why-label">Inputs</span>
                  <ul className="why-list">
                    {inputs.map((inp, i) => (
                      <li key={i}>{inp}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="why-section">
                <span className="why-label">Method</span>
                <p className="why-text">{method}</p>
              </div>
              {uncertainty ? (
                <div className="why-section">
                  <span className="why-label">Uncertainty</span>
                  <p className="why-text">{uncertainty}</p>
                </div>
              ) : null}
              {sampleSize !== undefined ? (
                <div className="why-footer">
                  <span className="muted">Sample size:</span> <strong>{sampleSize}</strong>
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </span>
  );
}

/**
 * Rating bar with live uncertainty "fuzz".
 * Shimmers subtly to reflect posterior standard error (sigma).
 */
export function UncertaintyFuzzBar({
  value,
  sd,
  min = 0,
  max = 100,
  label,
  color = 'var(--accent)',
}: {
  value: number;
  sd?: number;
  min?: number;
  max?: number;
  label?: string;
  color?: string;
}) {
  const span = Math.max(1, max - min);
  const pct = Math.max(0, Math.min(100, ((value - min) / span) * 100));
  const halfFuzz = sd ? Math.min(30, (sd / span) * 100) : 0;
  const lo = Math.max(0, pct - halfFuzz);
  const hi = Math.min(100, pct + halfFuzz);

  return (
    <div className="fuzz-wrap" title={`${label ?? 'Rating'}: ${value.toFixed(1)}${sd ? ` (±${sd.toFixed(1)} SD)` : ''}`}>
      <div className="fuzz-track">
        {sd ? (
          <div
            className="fuzz-zone"
            style={{
              left: `${lo}%`,
              width: `${Math.max(4, hi - lo)}%`,
              backgroundColor: color,
            }}
          />
        ) : null}
        <div
          className="fuzz-point"
          style={{
            left: `${pct}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
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
          toast(`${n} off your list.`);
        } else {
          addToPicklist(year, team);
          toast(`${n} on your list.`);
        }
      }}
    >
      {on ? 'On picklist' : 'Add to picklist'}
    </button>
  );
}
