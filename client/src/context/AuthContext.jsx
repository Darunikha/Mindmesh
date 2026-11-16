import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { refreshSession, setAccessToken, setSessionLostHandler } from '../api/client.js';
import { authApi } from '../api/endpoints.js';

export const AuthContext = createContext(null);

/**
 * status: 'loading' while restoring a session on boot, then 'authenticated' or 'anonymous'.
 * 'unreachable' means the server could not be contacted, so we don't know yet whether the
 * user is signed in. They are not sent to the sign-in page for that; they can retry.
 */
export function AuthProvider({ children }) {
  const [status, setStatus] = useState('loading');
  const [user, setUser] = useState(null);
  const [sessionNotice, setSessionNotice] = useState(null);
  const [bootTick, setBootTick] = useState(0);

  const clear = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus('anonymous');
  }, []);

  // Restore a session from the httpOnly refresh cookie on first load.
  useEffect(() => {
    let cancelled = false;
    // Restore the session; retry once on network or rate-limit errors before giving up.
    const restore = (attempt) =>
      refreshSession()
        .then((data) => {
          if (cancelled) return;
          setUser(data.user);
          setStatus('authenticated');
        })
        .catch((err) => {
          if (cancelled) return;
          if (err.status === 401) return clear();
          if (attempt === 0) return setTimeout(() => restore(1), 1500);
          return setStatus('unreachable');
        });
    restore(0);
    return () => {
      cancelled = true;
    };
  }, [clear, bootTick]);

  const retryRestore = useCallback(() => {
    setStatus('loading');
    setBootTick((n) => n + 1);
  }, []);

  // Try again by itself as soon as the connection comes back.
  useEffect(() => {
    if (status !== 'unreachable') return undefined;
    window.addEventListener('online', retryRestore);
    return () => window.removeEventListener('online', retryRestore);
  }, [status, retryRestore]);

  useEffect(() => {
    setSessionLostHandler((err) => {
      if (err?.code === 'TOKEN_REUSE' || err?.code === 'SESSION_REVOKED') {
        setSessionNotice(err.message);
      }
      clear();
    });
  }, [clear]);

  const acceptSession = useCallback((data) => {
    setAccessToken(data.accessToken);
    setUser(data.user);
    setSessionNotice(null);
    setStatus('authenticated');
    return data.user;
  }, []);

  const login = useCallback(async (creds) => acceptSession(await authApi.login(creds)), [acceptSession]);
  const register = useCallback(async (body) => acceptSession(await authApi.register(body)), [acceptSession]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      clear();
    }
  }, [clear]);

  const logoutEverywhere = useCallback(async () => {
    await authApi.logoutAll();
    clear();
  }, [clear]);

  const value = useMemo(
    () => ({
      status,
      user,
      isAuthenticated: status === 'authenticated',
      sessionNotice,
      clearSessionNotice: () => setSessionNotice(null),
      setUser,
      login,
      register,
      logout,
      logoutEverywhere,
      signOutLocally: clear,
      retryRestore,
    }),
    [status, user, sessionNotice, login, register, logout, logoutEverywhere, clear, retryRestore]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
