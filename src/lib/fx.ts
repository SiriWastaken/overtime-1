'use client';
// Small browser-side effects shared by client components: toasts, motion preference, calm mode, the picklist.
// Components talk through window events so server-rendered pages need no provider.

export const motionOk = () =>
  typeof window !== 'undefined' && !document.documentElement.hasAttribute('data-calm') && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function setCalm(on: boolean) {
  if (on) document.documentElement.setAttribute('data-calm', '');
  else document.documentElement.removeAttribute('data-calm');
  try {
    localStorage.setItem('ot:calm', on ? '1' : '0');
  } catch {}
  window.dispatchEvent(new Event('ot:calm'));
}

export function setTheme(dark: boolean) {
  if (dark) document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  try {
    localStorage.setItem('ot:theme', dark ? 'dark' : 'light');
  } catch {}
  window.dispatchEvent(new Event('ot:theme'));
}

/** Open the command palette (optionally straight to the season list). */
export const openPalette = (mode?: 'settings') => window.dispatchEvent(new CustomEvent('ot:palette', { detail: mode }));

/** Open the team slide-over. */
/** `see` = see-through card that leaves the page behind it usable (used on the team map). */
export const peek = (team: string, year: number, see = false) => window.dispatchEvent(new CustomEvent('ot:peek', { detail: { team, year, see } }));

// "My team" is a cookie so server-rendered tables can pin its row.
export function getMyTeam(): string | null {
  const m = document.cookie.match(/(?:^|; )ot_myteam=(frc\d{1,5})/);
  return m ? m[1] : null;
}
export function setMyTeam(team: string | null) {
  document.cookie = team ? `ot_myteam=${team}; path=/; max-age=31536000; samesite=lax` : 'ot_myteam=; path=/; max-age=0';
  window.dispatchEvent(new Event('ot:myteam'));
}

export function toast(message: string) {
  window.dispatchEvent(new CustomEvent('ot:toast', { detail: message }));
}

/** Replay a one-shot CSS animation class on an element. */
export function replay(el: Element | null, cls = 'snap') {
  if (!el) return;
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

// ---------------------------------------------------------------- picklist (per season, this device only)

const key = (year: number) => `ot:picklist:${year}`;

export function getPicklist(year: number): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key(year)) ?? '[]');
    return Array.isArray(v) ? v.filter((t) => typeof t === 'string' && /^frc\d{1,5}$/.test(t)) : [];
  } catch {
    return [];
  }
}

export function setPicklist(year: number, teams: string[]) {
  localStorage.setItem(key(year), JSON.stringify([...new Set(teams)].slice(0, 60)));
  window.dispatchEvent(new CustomEvent('ot:picklist', { detail: year }));
}

/** Returns false if the team was already on the list. */
export function addToPicklist(year: number, team: string): boolean {
  const list = getPicklist(year);
  if (list.includes(team)) return false;
  setPicklist(year, [...list, team]);
  return true;
}
