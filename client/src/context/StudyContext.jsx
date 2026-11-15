import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { flashcardsApi } from '../api/chat.js';

export const StudyContext = createContext({ stats: null, refresh: () => {} });

/** "3" for 3 due cards, "99+" above 99, nothing for none. */
export function dueBadge(count) {
  if (!count || count < 1) return null;
  return count > 99 ? '99+' : String(count);
}

/**
 * Flashcard counts and the review streak, shared by the sidebar badge, the Review page and
 * Home so they never disagree. Refreshed after reviews, when the tab regains focus, and
 * every few minutes (cards become due as time passes).
 */
export function StudyProvider({ children }) {
  const [stats, setStats] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setStats(await flashcardsApi.stats());
    } catch {
      /* The badge simply keeps its last value if the request fails. */
    }
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onFocus);
    const timer = setInterval(refresh, 5 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      clearInterval(timer);
    };
  }, [refresh]);

  const value = useMemo(() => ({ stats, refresh }), [stats, refresh]);
  return <StudyContext.Provider value={value}>{children}</StudyContext.Provider>;
}

export const useStudy = () => useContext(StudyContext);
