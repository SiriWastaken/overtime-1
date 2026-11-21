import { NoData, Empty, WinBar } from '@/components/bits';
import { seasonSpec } from '@/engine/seasons';
import { adHocForecast } from '@/lib/analysis';
import { pct, pts, range } from '@/lib/format';
import { modelRun, resolveYear } from '@/lib/queries';

export const metadata = { title: 'Predict a match' };

const parse = (s: string | undefined) =>
  (s ?? '')
    .split(/[\s,]+/)
    .map((x) => x.replace(/^frc/i, '').trim())
    .filter((x) => /^\d{1,5}$/.test(x))
    .slice(0, 3)
    .map((x) => `frc${x}`);

export default async function Predict({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const year = resolveYear(sp.year);
  if (!year || !modelRun(year)) return <NoData year={year} />;
  const red = parse(sp.red);
  const blue = parse(sp.blue);
  const ready = red.length === 3 && blue.length === 3;
  const out = ready ? adHocForecast(year, red, blue) : null;
  const spec = seasonSpec(year);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Predict a match</h1>
          <div className="sub">Any six {year} teams, using each team’s latest rating. Useful for practice scrimmages, pick-list what-ifs and upcoming schedules.</div>
        </div>
      </div>
      <form className="inline" action="/predict">
        <input type="hidden" name="year" value={year} />
        <label htmlFor="red" className="red-t" style={{ fontWeight: 700 }}>
          Red
        </label>
        <input id="red" type="text" name="red" defaultValue={red.map((t) => t.slice(3)).join(' ')} placeholder="254 1678 118" inputMode="numeric" style={{ width: 150 }} />
        <label htmlFor="blue" className="blue-t" style={{ fontWeight: 700 }}>
          Blue
        </label>
        <input id="blue" type="text" name="blue" defaultValue={blue.map((t) => t.slice(3)).join(' ')} placeholder="1323 4414 2056" inputMode="numeric" style={{ width: 150 }} />
        <button type="submit">Forecast</button>
      </form>
      {!ready ? (
        <Empty>Enter three team numbers per alliance.</Empty>
      ) : !out ? (
        <Empty>No model run for {year}.</Empty>
      ) : 'error' in out ? (
        <div className="notice">{out.error}. Only teams with {year} official matches have a rating.</div>
      ) : (
        <div className="linescore">
          <div className="ls-head">
            <span className="title">Hypothetical match</span>
            <span className="meta">
              {out.basis} · model {out.version}
            </span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Alliance</th>
                {spec.components.map((c) => (
                  <th key={c.id}>{c.label}</th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {(['red', 'blue'] as const).map((c) => (
                <tr key={c}>
                  <td>
                    <span className="side">
                      <span className={`swatch ${c}`} />
                      {(c === 'red' ? red : blue).map((t) => t.slice(3)).join(' · ')}
                    </span>
                  </td>
                  {spec.components.map((x) => (
                    <td key={x.id} className="n">
                      {pts(out.forecast[c].components[x.id], 0)}
                    </td>
                  ))}
                  <td className={`n total ${c === 'red' ? 'red-t' : 'blue-t'}`}>
                    {pts(out.forecast[c].mean, 0)}
                    <span className="range">{range(out.forecast[c].lo80, out.forecast[c].hi80)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ls-foot">
            <WinBar p={out.forecast.redWinProb} />
            <span className="verdict">
              Expected margin {out.forecast.margin >= 0 ? 'Red' : 'Blue'} +{pts(Math.abs(out.forecast.margin), 0)} · {pct(Math.max(out.forecast.redWinProb, 1 - out.forecast.redWinProb))} to win
            </span>
          </div>
        </div>
      )}
    </>
  );
}
