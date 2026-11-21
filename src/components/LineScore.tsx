import Link from 'next/link';
import { seasonSpec, type Phase } from '@/engine/seasons';
import { matchLabel, pct, pts, range, teamNum } from '@/lib/format';
import type { MatchWithPrediction } from '@/lib/queries';
import { WinBar } from './bits';

const PHASES: { id: Phase; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'teleop', label: 'Teleop' },
  { id: 'endgame', label: 'Endgame' },
  { id: 'fouls', label: 'Fouls' },
];

/** Points per scoring period: predicted (from the forecast's components) or actual (from the TBA breakdown). */
export function phaseTotals(year: number, m: MatchWithPrediction, color: 'red' | 'blue') {
  const spec = seasonSpec(year);
  const f = m.prediction?.forecast[color];
  const b = m.breakdown?.[color] ?? null;
  const score = color === 'red' ? m.redScore : m.blueScore;
  const pred: Partial<Record<Phase, number>> = {};
  const act: Partial<Record<Phase, number | null>> = {};
  for (const c of spec.components) {
    if (f) pred[c.phase] = (pred[c.phase] ?? 0) + (f.components[c.id] ?? 0);
    if (score !== null) {
      const v = c.points(b, score);
      act[c.phase] = v === null || act[c.phase] === null ? null : (act[c.phase] ?? 0) + v;
    }
  }
  return { pred, act, phases: PHASES.filter((p) => spec.components.some((c) => c.phase === p.id)) };
}

export function LineScore({ m, year, title, link = true }: { m: MatchWithPrediction; year: number; title?: string; link?: boolean }) {
  const f = m.prediction?.forecast;
  const played = m.redScore !== null;
  const rows = (['red', 'blue'] as const).map((c) => ({ c, ...phaseTotals(year, m, c) }));
  const phases = rows[0].phases;
  const fav = f ? (f.redWinProb >= 0.5 ? 'red' : 'blue') : null;
  const hit = played && f && m.winner !== 'tie' ? fav === m.winner : null;
  const name = title ?? matchLabel(m);
  return (
    <div className="linescore">
      <div className="ls-head">
        <span className="title">{link ? <Link href={`/matches/${m.key}`}>{name}</Link> : name}</span>
        <span className="muted">{m.eventKey.slice(4).toUpperCase()}</span>
        <span className="meta">
          {f ? (m.prediction!.kind === 'pre_match' ? 'Forecast frozen at match start' : 'Live forecast') : 'No forecast'}
          {f && !f.eligible ? ' · early-season (uninformed)' : ''}
        </span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Alliance</th>
              {phases.map((p) => (
                <th key={p.id} scope="col" className={p.id === 'endgame' || p.id === 'fouls' ? 'ph-minor' : undefined}>
                  {p.label}
                </th>
              ))}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ c, pred, act }) => {
              const side = f?.[c];
              const score = c === 'red' ? m.redScore : m.blueScore;
              const teams = m[c];
              return [
                played ? (
                  <tr key={`${c}-a`}>
                    <td>
                      <span className="side">
                        <span className={`swatch ${c}`} />
                        <span className={`teams ${m.winner === c ? 'won' : ''}`}>
                          {teams.map((t, i) => (
                            <span key={t}>
                              {i > 0 ? ' · ' : ''}
                              <Link href={`/teams/${teamNum(t)}?year=${year}`}>{teamNum(t)}</Link>
                            </span>
                          ))}
                        </span>
                      </span>
                    </td>
                    {phases.map((p) => (
                      <td key={p.id} className={`n${p.id === 'endgame' || p.id === 'fouls' ? ' ph-minor' : ''}`}>
                        {pts(act[p.id] ?? null, 0)}
                      </td>
                    ))}
                    <td className={`n total ${c === 'red' ? 'red-t' : 'blue-t'}`}>{score}</td>
                  </tr>
                ) : null,
                side ? (
                  <tr key={`${c}-p`} className={played ? 'pred' : ''}>
                    <td>
                      {played ? (
                        <span className="side">
                          <span className="swatch" />
                          forecast
                        </span>
                      ) : (
                        <span className="side">
                          <span className={`swatch ${c}`} />
                          <span className="teams">
                            {teams.map((t, i) => (
                              <span key={t}>
                                {i > 0 ? ' · ' : ''}
                                <Link href={`/teams/${teamNum(t)}?year=${year}`}>{teamNum(t)}</Link>
                              </span>
                            ))}
                          </span>
                        </span>
                      )}
                    </td>
                    {phases.map((p) => (
                      <td key={p.id} className={`n${p.id === 'endgame' || p.id === 'fouls' ? ' ph-minor' : ''}`}>
                        {pts(pred[p.id] ?? 0, 0)}
                      </td>
                    ))}
                    <td className={`n total ${played ? '' : c === 'red' ? 'red-t' : 'blue-t'}`}>
                      {pts(side.mean, 0)}
                      <span className="range">{range(side.lo80, side.hi80)}</span>
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>
      </div>
      <div className="ls-foot">
        {f ? (
          <>
            <WinBar p={f.redWinProb} />
            <span className="muted">small figures = 80% range</span>
          </>
        ) : (
          <span className="muted">No forecast stored for this match.</span>
        )}
        {hit !== null ? (
          <span className="verdict">
            Favourite {fav === 'red' ? 'Red' : 'Blue'} ({pct(Math.max(f!.redWinProb, 1 - f!.redWinProb))}) <span className={hit ? 'hit' : 'miss'}>{hit ? 'won' : 'lost'}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
