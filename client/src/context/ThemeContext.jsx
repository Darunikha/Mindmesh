import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { useAuth } from './AuthContext.jsx';
import { useToast } from './ToastContext.jsx';
import { usersApi } from '../api/endpoints.js';
import { DEFAULT_THEME, isThemeId } from '../themes/registry.js';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'mm.theme';

function readStoredTheme() {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    return isThemeId(t) ? t : null;
  } catch {
    return null;
  }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage unavailable: theme still applies for this visit */
  }
}

/**
 * The theme is a single attribute on <html>. Changing it never remounts the React
 * tree, so in-progress drafts and other state survive a switch.
 * Signed-in users' choice is persisted to their account; anonymous visitors' to localStorage.
 */
export function ThemeProvider({ children }) {
  const { user, setUser, isAuthenticated } = useAuth();
  const toast = useToast();
  const [theme, setThemeState] = useState(() => readStoredTheme() || DEFAULT_THEME);
  const pending = useRef(0);

  useEffect(() => applyTheme(theme), [theme]);

  // Adopt the account's saved theme whenever a user signs in or is refreshed.
  const accountTheme = user?.preferences?.theme;
  useEffect(() => {
    if (isThemeId(accountTheme) && pending.current === 0) setThemeState(accountTheme);
  }, [accountTheme]);

  const reduceMotion = Boolean(user?.preferences?.reduceMotion);
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(reduceMotion);
  }, [reduceMotion]);

  /**
   * @param {string} next theme id
   * @param {{ persist?: boolean }} opts persist=false previews without saving (e.g. onboarding)
   */
  const setTheme = useCallback(
    async (next, { persist = true } = {}) => {
      if (!isThemeId(next)) return;
      const previous = theme;
      setThemeState(next);
      if (!persist || !isAuthenticated) return;
      pending.current += 1;
      try {
        const { user: updated } = await usersApi.updatePreferences({ theme: next });
        setUser(updated);
      } catch (err) {
        setThemeState(previous);
        toast.error(`Couldn't save your theme: ${err.message}`);
      } finally {
        pending.current -= 1;
      }
    },
    [theme, isAuthenticated, setUser, toast]
  );

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return (
    <ThemeContext.Provider value={value}>
      <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>{children}</MotionConfig>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
