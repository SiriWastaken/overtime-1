// Command line entry point.
//   node scripts/overtime.ts sync <year> [--full]    pull a season from TBA into SQLite
//   node scripts/overtime.ts model <year>            run the walk-forward model and store outputs
//   node scripts/overtime.ts update <year>           sync, then re-run the model if anything changed
//   node scripts/overtime.ts current                 print TBA's current season

import { runAndStore } from '../src/lib/pipeline.ts';
import { syncSeason } from '../src/lib/sync.ts';
import { TbaClient, v, type TbaStatus } from '../src/lib/tba.ts';

const [cmd, arg, ...flags] = process.argv.slice(2);
const year = Number(arg);
const log = (s: string) => console.log(s);

function report(r: Awaited<ReturnType<typeof syncSeason>>) {
  log(`sync ${r.year}: ${r.events} events, ${r.refreshed} refreshed, changed=${r.changed}, stale=${r.stale}`);
  log(`  requests=${r.stats.requests} 304=${r.stats.notModified} cache=${r.stats.cacheHits} errors=${r.stats.errors}`);
  for (const e of r.errors) console.error(`  ! ${e}`);
}

function model(y: number) {
  const t = Date.now();
  const out = runAndStore(y);
  if (!out) return log(`model ${y}: no matches stored; run sync first`);
  const { run } = out;
  log(`model ${y}: ${run.version}, ${run.forecasts.length} forecasts, ${run.evaluated} evaluated (${run.excluded.notEligible} early-season matches excluded) in ${Date.now() - t} ms`);
  const all = run.validation.filter((x) => x.split === 'all');
  log('  model                                  n     MAE    Brier   LogLoss  Acc    Cov80');
  for (const x of all)
    log(
      `  ${x.label.padEnd(38)} ${String(x.metrics.n).padStart(5)} ${x.metrics.scoreMae.toFixed(1).padStart(6)} ${x.metrics.brier.toFixed(4).padStart(7)} ${x.metrics.logLoss.toFixed(4).padStart(8)} ${(100 * x.metrics.accuracy).toFixed(1).padStart(5)}% ${x.metrics.coverage ? (100 * x.metrics.coverage.p80).toFixed(1) + '%' : '   —'}`
    );
}

async function main() {
  if (cmd === 'current') {
    const s = await new TbaClient().get<TbaStatus>('/status', v.status);
    return log(String(s.data?.current_season));
  }
  if (!Number.isInteger(year) || year < 1992) throw new Error('usage: overtime.ts <sync|model|update> <year> [--full]');
  if (cmd === 'sync') report(await syncSeason(year, { full: flags.includes('--full'), log }));
  else if (cmd === 'model') model(year);
  else if (cmd === 'update') {
    const r = await syncSeason(year, { log });
    report(r);
    if (r.changed || flags.includes('--force')) model(year);
  } else throw new Error(`unknown command ${cmd}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
