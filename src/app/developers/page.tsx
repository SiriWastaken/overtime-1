import { Tip } from '@/components/ui';
import { ENDPOINTS } from '@/lib/endpoints';
import { ago, stamp } from '@/lib/format';
import { freshness, latestSyncs, modelRun, seasons } from '@/lib/queries';

export const metadata = { title: 'Data & API' };

export default function Developers() {
  const syncs = new Map(latestSyncs().map((s) => [s.year, s]));
  const rows = seasons().map((s) => ({ ...s, sync: syncs.get(s.year) ?? null, run: s.modelled ? modelRun(s.year) : null }));
  const keyed = freshness(null).tbaKeyConfigured;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Data &amp; API</h1>
          <div className="sub">Sources, freshness, endpoints.</div>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Data source</h2>
          <Tip label="About the data">Every score comes from The Blue Alliance. Missing data stays missing.</Tip>
        </div>
        {keyed ? null : (
          <div className="notice">
            <strong>Live updates off.</strong> Showing saved data.
          </div>
        )}
        {rows.length ? (
          <div className="table-wrap">
            <table className="agate">
              <thead>
                <tr>
                  <th>Season</th>
                  <th>Status</th>
                  <th className="n">Matches</th>
                  <th>Last updated</th>
                  <th className="hide-m">Results through</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const failed = r.sync && r.sync.ok === 0;
                  return (
                    <tr key={r.year}>
                      <td className="strong">{r.year}</td>
                      <td>
                        <span className={`signal${failed || !r.sync ? ' stale' : ''}`} aria-hidden />
                        {!r.sync ? 'Saved copy' : failed ? 'Last update failed' : r.sync.finished_at ? 'Up to date' : 'Updating…'}
                        {!r.run ? <span className="muted"> · not modelled yet</span> : null}
                      </td>
                      <td className="n">{r.matches.toLocaleString()}</td>
                      <td>{r.sync?.finished_at ? ago(r.sync.finished_at) : '—'}</td>
                      <td className="hide-m muted">{r.run ? stamp(r.run.data_as_of) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <strong>No data yet.</strong>
            Add a The Blue Alliance read key as <code>TBA_API_KEY</code> in <code>.env.local</code>, then run <code>npm run update -- 2026</code>.
          </div>
        )}
        {rows.length ? (
          <details className="more-detail">
            <summary>Technical details</summary>
            <div className="table-wrap">
              <table className="agate">
                <thead>
                  <tr>
                    <th>Season</th>
                    <th>Source</th>
                    <th className="n">Requests</th>
                    <th className="n" title="HTTP 304: TBA confirmed nothing changed">
                      Unchanged
                    </th>
                    <th className="n">Errors</th>
                    <th>Sync started</th>
                    <th>Model</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.year}>
                      <td>{r.year}</td>
                      <td>
                        <code>GET thebluealliance.com/api/v3</code>
                      </td>
                      <td className="n">{r.sync?.requests ?? '—'}</td>
                      <td className="n">{r.sync?.not_modified ?? '—'}</td>
                      <td className={`n${r.sync?.errors ? ' miss' : ''}`}>{r.sync?.errors ?? '—'}</td>
                      <td className="muted">{r.sync ? stamp(r.sync.started_at) : '—'}</td>
                      <td className="muted">{r.run ? `${r.run.version}, run ${r.run.id}` : '—'}</td>
                      <td className="wrap muted">{r.sync?.message ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>Responses are cached with their ETags, so routine updates send conditional requests and only download what changed.</p>
          </details>
        ) : null}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Public API</h2>
          <span className="note">Free. No key.</span>
          <Tip label="About the API">JSON with open CORS. Works from browsers, apps and spreadsheets.</Tip>
        </div>
        <pre className="code">
          <code>{`curl https://<your-host>/api/v1/seasons/2026/edge?limit=10
curl "https://<your-host>/api/v1/predict?year=2026&red=254,1678,118&blue=1323,4414,2056"`}</code>
        </pre>
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table className="agate">
            <thead>
              <tr>
                <th>Request</th>
                <th>Returns</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map(([p, d]) => (
                <tr key={p}>
                  <td>
                    <code>{p}</code>
                  </td>
                  <td className="wrap">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="more-detail">
          <summary>Conventions</summary>
          <div className="prose" style={{ fontSize: 14 }}>
            <ul>
              <li>
                Team parameters accept <code>254</code> or <code>frc254</code>. Event and match keys are TBA keys (<code>2026casj</code>, <code>2026casj_qm12</code>).
              </li>
              <li>
                xPts ratings are points per match; every estimate has an <code>sd</code>. EDGE values are win-probability differences (<code>0.10</code> = +10 percentage points)
                with <code>lo80</code>/<code>hi80</code>.
              </li>
              <li>
                Forecasts carry <code>cutoff</code> (newest result they could see, Unix seconds) and <code>kind</code>: <code>pre_match</code> is locked at match start,{' '}
                <code>live</code> uses everything known now.
              </li>
              <li>
                Errors are JSON: <code>{`{ "error": "...", "status": 404 }`}</code>. 400 = bad parameter, 404 = not found or not yet modelled.
              </li>
              <li>Responses may be cached for 60 seconds. Please cache on your side too, and don’t poll more than once a minute.</li>
              <li>Source data comes from The Blue Alliance. Credit TBA when you republish it.</li>
            </ul>
          </div>
        </details>
      </section>
    </>
  );
}
