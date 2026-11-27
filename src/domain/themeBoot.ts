/** Kept apart from theme.ts (which uses React hooks) so the server-rendered root layout can import it. */
export const THEME_STORAGE_KEY = 'hvac-theme';

/**
 * Runs before the page paints (inlined in the root layout), so a dark page never flashes light.
 * Same rule as resolveTheme() in theme.ts: a saved 'light' or 'dark', otherwise the system setting.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_STORAGE_KEY}');var t=p==='dark'||p==='light'?p:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}catch(e){}})();`;
