import { ENDPOINTS } from '@/lib/endpoints';

export const metadata = { title: 'API' };

export default function Developers() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Public API</h1>
          <div className="sub">Free, no key, no sign-up. JSON over HTTPS with open CORS, so it works straight from a browser, a scouting app or a spreadsheet.</div>
        </div>
      </div>
      <div className="prose">
        <pre>
          <code>{`curl https://<your-host>/api/v1/seasons/2026/teams?limit=10
curl "https://<your-host>/api/v1/predict?year=2026&red=254,1678,118&blue=1323,4414,2056"`}</code>
        </pre>
      </div>
      <section className="section">
        <div className="section-head">
          <h2>Endpoints</h2>
        </div>
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
      </section>
      <div className="prose">
        <h2>Conventions</h2>
        <ul>
          <li>Team parameters accept <code>254</code> or <code>frc254</code>. Event and match keys are TBA keys (<code>2026casj</code>, <code>2026casj_qm12</code>).</li>
          <li>
            Ratings are expected points per match. Every estimate has an <code>sd</code>. A forecast carries <code>cutoff</code> (newest result it could see, Unix seconds) and{' '}
            <code>kind</code>: <code>pre_match</code> is frozen at match start, <code>live</code> uses everything known now.
          </li>
          <li>Errors are JSON: <code>{`{ "error": "...", "status": 404 }`}</code>. 400 = bad parameter, 404 = not found or not yet modelled.</li>
          <li>Responses may be cached for 60 seconds. Please cache on your side too and avoid polling faster than once a minute.</li>
          <li>Source data comes from The Blue Alliance. Credit TBA when you republish it.</li>
        </ul>
      </div>
    </>
  );
}
