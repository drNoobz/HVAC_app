/**
 * Light and dark themes. The chosen theme is stored in this browser and applied as data-theme on <html>; every
 * colour in the app comes from CSS variables that change with it (src/app/globals.css).
 *
 * Data colours (air types, wall constructions, load categories) are hex values shared with the 3D view. On the plan
 * and in swatches they go through ink() or wash(), which keep their hue in both themes:
 * - ink(): lines, text, markers and translucent tints. Unchanged in light. In dark, lightness L becomes
 *   0.48 + 0.55 L: every colour reads on the dark plan, and a darker colour stays darker than a lighter one.
 * - wash(): opaque pale fills such as room colours. Unchanged in light; turned into a dark tint of the same hue in dark.
 * See docs/agents/theme.md.
 */
import { useEffect, useState } from 'react';
import { THEME_STORAGE_KEY } from './themeBoot';

export { THEME_STORAGE_KEY };

export type ThemePreference = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

/** Fired on window when the applied theme changes, with the theme as detail. */
export const THEME_EVENT = 'hvac-theme-change';

/** Values ink() and wash() leave alone: no colour, or a colour that already follows the theme. */
const PASS = /^(none|transparent|currentColor|inherit|var\(|oklch\(from |color-mix\(|url\()/;

export function ink<T extends string | undefined>(color: T): T {
  if (!color || PASS.test(color)) return color;
  return `oklch(from ${color} calc(var(--ink-l-base) + var(--ink-l-scale) * l) calc(c * var(--ink-chroma)) h / alpha)` as T;
}

export function wash<T extends string | undefined>(color: T): T {
  if (!color || PASS.test(color)) return color;
  return `oklch(from ${color} min(l, var(--wash-l)) calc(c * var(--wash-chroma)) h / alpha)` as T;
}

/** A colour faded toward the plan's background: white in light, the dark paper in dark. `amount` 0 keeps it. */
export function fade(color: string, amount: number): string {
  return `color-mix(in srgb, ${ink(color)}, var(--plan-halo) ${Math.round(amount * 1000) / 10}%)`;
}

/** The plan drawing's neutral colours (globals.css). */
export const PLAN_COLOR = {
  paper: 'var(--plan-paper)',
  ink: 'var(--plan-ink)',
  grid: 'var(--plan-grid)',
  gridMajor: 'var(--plan-grid-major)',
  dim: 'var(--plan-dim)',
  select: 'var(--plan-select)',
  selectStrong: 'var(--plan-select-strong)',
  selectFill: 'var(--plan-select-fill)',
  halo: 'var(--plan-halo)',
  card: 'var(--plan-card)',
  compass: 'var(--plan-compass)',
  compass2: 'var(--plan-compass-2)',
  guide: 'var(--plan-guide)',
  draft: 'var(--plan-draft)',
  draftStrong: 'var(--plan-draft-strong)',
  /** Clash marks: the Check warning colours. */
  clash: 'var(--danger-strong)',
  clashFill: 'var(--plan-clash-fill)',
} as const;

export function loadThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(preference: ThemePreference): Theme {
  return preference === 'system' ? systemTheme() : preference;
}

export function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(preference: ThemePreference): void {
  const theme = resolveTheme(preference);
  const root = document.documentElement;
  if (root.dataset.theme === theme) return;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
}

export function saveThemePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage full or blocked: the theme still applies for this visit.
  }
  applyTheme(preference);
}

/** The stored preference and a setter that saves and applies it. Only for client-rendered UI (Settings). */
export function useThemePreference(): [ThemePreference, (preference: ThemePreference) => void] {
  const [preference, setPreference] = useState<ThemePreference>(loadThemePreference);
  return [
    preference,
    next => {
      saveThemePreference(next);
      setPreference(next);
    },
  ];
}

/** Mounted once at the app root: applies the stored theme and follows the system while the choice is "system". */
export function useThemeSync(): void {
  useEffect(() => {
    applyTheme(loadThemePreference());
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    const follow = () => {
      if (loadThemePreference() === 'system') applyTheme('system');
    };
    query?.addEventListener('change', follow);
    return () => query?.removeEventListener('change', follow);
  }, []);
}

/** The applied theme, for code that cannot use CSS variables (the 3D view). */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>('light');
  useEffect(() => {
    setTheme(currentTheme());
    const onChange = (event: Event) => setTheme((event as CustomEvent<Theme>).detail);
    window.addEventListener(THEME_EVENT, onChange);
    return () => window.removeEventListener(THEME_EVENT, onChange);
  }, []);
  return theme;
}
