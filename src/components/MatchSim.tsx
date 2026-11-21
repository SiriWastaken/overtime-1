'use client';

import { useEffect, useRef, useState } from 'react';
import { Avatar } from './bits';
import { EdgeGauge } from './edge';
import { Tug, type Side as Proj } from './Tug';

type Side = 'red' | 'blue';
interface Hit {
  key: string;
  number: number;
  nickname: string | null;
  edge: number | null;
}

/** Type six team numbers; the rope moves as you type. No submit. */
export function MatchSim({ year, initial }: { year: number; initial: Record<Side, string[]> }) {
  const [nums, setNums] = useState(initial);
  const [teams, setTeams] = useState(new Map<string, Hit | null>());
  const [proj, setProj] = useState<{ redWinProb: number; red: Proj; blue: Proj } | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const asked = useRef(new Set<string>());

  const valid = (s: Side) => nums[s].filter((x) => /^\d{1,5}$/.test(x));

  // team names + EDGE, once per number
  useEffect(() => {
    for (const x of [...valid('red'), ...valid('blue')]) {
      if (asked.current.has(x)) continue;
      asked.current.add(x);
      fetch(`/api/v1/search?year=${year}&q=${x}`)
        .then((r) => r.json())
        .then((d: { teams: Hit[] }) => setTeams((m) => new Map(m).set(x, d.teams.find((t) => String(t.number) === x) ?? null)))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nums, year]);

  useEffect(() => {
    const red = valid('red');
    const blue = valid('blue');
    const p = new URLSearchParams({ year: String(year) });
    if (red.length) p.set('red', red.join(','));
    if (blue.length) p.set('blue', blue.join(','));
    window.history.replaceState(null, '', `/predict?${p}`);
    if (!red.length || !blue.length) {
      setProj(null);
      setState('idle');
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      setState('loading');
      fetch(`/api/v1/predict?${p}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((d: { forecast: { redWinProb: number; red: Proj; blue: Proj } }) => {
          setProj(d.forecast);
          setState('ok');
        })
        .catch((e) => e?.name !== 'AbortError' && setState('error'));
    }, 160);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nums, year]);

  const side = (s: Side) => (
    <fieldset className={`sim-side ${s}`}>
      <legend className={s === 'red' ? 'red-t' : 'blue-t'}>{s === 'red' ? 'Red' : 'Blue'}</legend>
      {[0, 1, 2].map((i) => {
        const x = nums[s][i] ?? '';
        const t = /^\d{1,5}$/.test(x) ? teams.get(x) : undefined;
        return (
          <div key={i} className="sim-row">
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={5}
              aria-label={`${s === 'red' ? 'Red' : 'Blue'} team ${i + 1}`}
              placeholder="Team #"
              value={x}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '');
                setNums((n) => ({ ...n, [s]: Object.assign([...n[s], '', '', ''].slice(0, 3), { [i]: v }) }));
              }}
            />
            {t ? <Avatar team={x} year={year} size={24} /> : null}
            <span className="sim-name">{t === null ? 'Not rated' : (t?.nickname ?? '')}</span>
            {t ? <EdgeGauge edge={t.edge} size="xs" /> : null}
          </div>
        );
      })}
    </fieldset>
  );

  return (
    <div className="sim">
      <div className="sim-sides">
        {side('red')}
        {side('blue')}
      </div>
      <Tug redP={proj ? proj.redWinProb : null} red={proj?.red} blue={proj?.blue} busy={state === 'loading'} idle={state === 'error' ? 'Timeout. Check the numbers.' : 'One team a side to start'} />
    </div>
  );
}
