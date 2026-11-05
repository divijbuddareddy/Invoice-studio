// Light / dark / system theme for the app UI (PDFs are always printed on white).

import { getPref, setPref } from './storage/prefs';

export type ThemePref = 'light' | 'dark' | 'system';

const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);

export const getThemePref = (): ThemePref => getPref<ThemePref>('theme', 'system');

export function applyTheme(pref: ThemePref = getThemePref()): void {
  const dark = pref === 'dark' || (pref === 'system' && !!media()?.matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

export function setThemePref(pref: ThemePref): void {
  setPref('theme', pref);
  applyTheme(pref);
}

/** Apply the saved theme and follow OS changes while set to "system". */
export function initTheme(): void {
  applyTheme();
  media()?.addEventListener?.('change', () => {
    if (getThemePref() === 'system') applyTheme('system');
  });
}
