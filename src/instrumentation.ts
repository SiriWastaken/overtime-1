// Keeps the current season fresh while the server runs: incremental TBA sync (ETag-revalidated, so cheap when
// nothing changed) and a model re-run only when new data arrived. Disable with OVERTIME_AUTOSYNC=0.

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || !process.env.TBA_API_KEY || process.env.OVERTIME_AUTOSYNC === '0') return;
  const { TbaClient, v } = await import('./lib/tba.ts');
  const { syncSeason } = await import('./lib/sync.ts');
  const { runAndStore } = await import('./lib/pipeline.ts');
  const minutes = Math.max(2, Number(process.env.OVERTIME_SYNC_MINUTES) || 5);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const status = await new TbaClient().get('/status', v.status);
      const year = status.data?.current_season ?? new Date().getFullYear();
      const r = await syncSeason(year);
      if (r.changed) runAndStore(year);
      if (r.errors.length) console.warn(`[overtime] sync ${year}: ${r.errors.length} error(s)`);
    } catch (e) {
      console.warn('[overtime] auto-sync failed:', e instanceof Error ? e.message : e);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 5_000);
  setInterval(tick, minutes * 60_000).unref();
}
