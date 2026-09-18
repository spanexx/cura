/**
 * Theme persistence and application.
 *
 * The app ships dark by default and offers a light theme. The choice is stored
 * the same defensive way as the other persisted state: validated on read so a
 * stale or hand-edited value degrades to the default instead of breaking the UI.
 *
 * `storage` / `root` are injectable so the logic can be tested without a DOM.
 */

export const THEMES = ['dark', 'light'];
export const DEFAULT_THEME = 'dark';
export const THEME_STORAGE_KEY = 'ryanair-agent-simulator.theme';

const readStore = (storage) => {
  try {
    return storage ?? globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** Returns 'dark' | 'light', always valid. */
export const loadTheme = (storage) => {
  const store = readStore(storage);
  if (!store) return DEFAULT_THEME;

  try {
    const raw = store.getItem(THEME_STORAGE_KEY);
    return THEMES.includes(raw) ? raw : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

/** Best effort write: private mode or a full quota must not break the app. */
export const saveTheme = (theme, storage) => {
  const store = readStore(storage);
  if (!store) return false;

  try {
    store.setItem(THEME_STORAGE_KEY, THEMES.includes(theme) ? theme : DEFAULT_THEME);
    return true;
  } catch {
    return false;
  }
};

/**
 * Applies the theme to the document root. Tailwind's darkMode: 'class' reads
 * the `dark` class; colorScheme keeps native controls and scrollbars in step.
 */
export const applyTheme = (theme, root) => {
  const target = root ?? (typeof document !== 'undefined' ? document.documentElement : null);
  if (!target) return false;

  const isDark = theme === 'dark';
  target.classList.toggle('dark', isDark);
  target.style.colorScheme = isDark ? 'dark' : 'light';
  return true;
};

export const nextTheme = (theme) => (theme === 'dark' ? 'light' : 'dark');
