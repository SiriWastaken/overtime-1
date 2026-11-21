// Display formatting. Probabilities are whole percents (never false precision); points are whole numbers
// unless a value is small enough that a decimal carries information.

export const pts = (x: number | null | undefined, digits?: number) => {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  const d = digits ?? (Math.abs(x) < 10 ? 1 : 0);
  const s = x.toFixed(d);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s; // no "-0.0"
};

export const pct = (p: number | null | undefined) => {
  if (p === null || p === undefined || !Number.isFinite(p)) return '—';
  if (p === 0) return '0%';
  if (p === 1) return '100%';
  if (p < 0.01) return '<1%';
  if (p > 0.99) return '>99%';
  return `${Math.round(p * 100)}%`;
};

export const pct1 = (p: number | null | undefined) => (p === null || p === undefined || !Number.isFinite(p) ? '—' : `${(p * 100).toFixed(1)}%`);

export const range = (lo: number, hi: number) => `${Math.round(Math.max(lo, 0))}–${Math.round(hi)}`;

export const teamNum = (key: string) => key.replace(/^frc/, '');

export function ago(t: number | null | undefined, now = Date.now() / 1000): string {
  if (!t) return 'never';
  const s = Math.max(0, now - t);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400 * 2) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

export const dateShort = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
export const dateRange = (a: string, b: string) => (a === b ? dateShort(a) : `${dateShort(a)}–${dateShort(b)}`);
export const stamp = (t: number) => new Date(t * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' });

const LEVEL: Record<string, string> = { qm: 'Qual', ef: 'Octo', qf: 'Quarter', sf: 'Playoff', f: 'Final' };
export function matchLabel(m: { compLevel: string; setNumber: number; matchNumber: number }, deMode = true) {
  if (m.compLevel === 'qm') return `Qual ${m.matchNumber}`;
  if (m.compLevel === 'sf' && deMode) return `Match ${m.setNumber}${m.matchNumber > 1 ? ` (replay ${m.matchNumber})` : ''}`;
  if (m.compLevel === 'f') return `Final ${m.matchNumber}`;
  return `${LEVEL[m.compLevel]} ${m.setNumber}-${m.matchNumber}`;
}

export const location = (x: { city: string | null; state_prov: string | null; country: string | null }) => [x.city, x.state_prov, x.country === 'USA' ? null : x.country].filter(Boolean).join(', ');
