// EDGE walk-forward scale check.  node scripts/edge.ts <year> [<year>...]
// Writes edge-check-<year>.json next to the database (read by the methodology page) and prints a summary.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { dbPath } from '../src/lib/db.ts';
import { edgeScaleCheck } from '../src/lib/edge.ts';

for (const y of process.argv.slice(2).map(Number)) {
  const t = Date.now();
  const r = edgeScaleCheck(y);
  writeFileSync(join(dirname(dbPath()), `edge-check-${y}.json`), JSON.stringify({ ...r, generatedAt: Math.floor(Date.now() / 1000) }, null, 2));
  console.log(`${y}: ${r.matches} matches, ${r.skippedWarmup} in warm-up, ${Date.now() - t} ms`);
  console.log('  split         n    slope   Brier edge / xPts / 0.5     LogLoss edge / xPts / 0.5');
  for (const [k, s] of Object.entries(r.splits))
    console.log(
      `  ${k.padEnd(12)} ${String(s.n).padStart(5)}  ${s.slope.toFixed(2).padStart(5)}   ${s.brier.edge.toFixed(4)} / ${s.brier.xpts.toFixed(4)} / ${s.brier.coinFlip.toFixed(4)}   ${s.logLoss.edge.toFixed(4)} / ${s.logLoss.xpts.toFixed(4)} / ${s.logLoss.coinFlip.toFixed(4)}`
    );
  console.log('  bins (predicted → observed, n):', r.splits.all.bins.map((b) => `${(100 * b.predicted).toFixed(0)}→${(100 * b.observed).toFixed(0)} (${b.n})`).join('  '));
}
