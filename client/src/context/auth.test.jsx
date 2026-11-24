import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext.jsx';

const client = vi.hoisted(() => ({
  refreshSession: vi.fn(),
  setAccessToken: vi.fn(),
  setSessionLostHandler: vi.fn(),
}));
const endpoints = vi.hoisted(() => ({ authApi: { login: vi.fn(), register: vi.fn(), logout: vi.fn(), logoutAll: vi.fn() } }));
vi.mock('../api/client.js', () => client);
vi.mock('../api/endpoints.js', () => endpoints);

const ada = { id: 'u1', name: 'Ada', onboardingCompleted: true };
const err = (status, code = 'X', message = 'msg') => Object.assign(new Error(message), { status, code });
const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
const setup = () => renderHook(() => useAuth(), { wrapper });
/** The function AuthProvider registered to be told when the session dies. */
const lostHandler = () => client.setSessionLostHandler.mock.calls.at(-1)[0];

beforeEach(() => {
  vi.clearAllMocks();
  client.refreshSession.mockResolvedValue({ user: ada, accessToken: 'tok' });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('AuthProvider: restoring a session on start-up', () => {
  it('starts as loading, then signs in from the refresh cookie', async () => {
    const { result } = setup();
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.user).toEqual(ada);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('becomes anonymous (and forgets any token) when there is no valid session', async () => {
    client.refreshSession.mockRejectedValue(err(401, 'NO_SESSION'));
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(client.setAccessToken).toHaveBeenCalledWith(null);
  });

  it('retries once after a short wait when the server can’t be reached, then recovers', async () => {
    vi.useFakeTimers();
    client.refreshSession.mockRejectedValueOnce(err(0, 'NETWORK')).mockResolvedValue({ user: ada, accessToken: 't' });
    const { result } = setup();
    await act(async () => {});
    expect(result.current.status).toBe('loading');
    await act(async () => void vi.advanceTimersByTime(1600));
    expect(client.refreshSession).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('authenticated');
  });

  it('says "unreachable" (not "signed out") when the server stays down', async () => {
    vi.useFakeTimers();
    client.refreshSession.mockRejectedValue(err(0, 'NETWORK'));
    const { result } = setup();
    await act(async () => {});
    await act(async () => void vi.advanceTimersByTime(1600));
    expect(result.current.status).toBe('unreachable');
    expect(result.current.user).toBeNull();
    expect(client.setAccessToken).not.toHaveBeenCalledWith(null);
  });

  it('treats a 5xx the same way as an unreachable server', async () => {
    vi.useFakeTimers();
    client.refreshSession.mockRejectedValue(err(502, 'ERROR'));
    const { result } = setup();
    await act(async () => {});
    await act(async () => void vi.advanceTimersByTime(1600));
    expect(result.current.status).toBe('unreachable');
  });

  it('does not retry a 401: that is a definite answer', async () => {
    client.refreshSession.mockRejectedValue(err(401, 'SESSION_REVOKED'));
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    expect(client.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('retryRestore tries again right away and signs in when the server is back', async () => {
    vi.useFakeTimers();
    client.refreshSession.mockRejectedValueOnce(err(0, 'NETWORK')).mockRejectedValueOnce(err(0, 'NETWORK'));
    const { result } = setup();
    await act(async () => {});
    await act(async () => void vi.advanceTimersByTime(1600));
    expect(result.current.status).toBe('unreachable');

    client.refreshSession.mockResolvedValue({ user: ada, accessToken: 't' });
    await act(async () => result.current.retryRestore());
    expect(result.current.status).toBe('authenticated');
  });

  it('tries again by itself when the browser comes back online', async () => {
    vi.useFakeTimers();
    client.refreshSession.mockRejectedValueOnce(err(0, 'NETWORK')).mockRejectedValueOnce(err(0, 'NETWORK'));
    const { result } = setup();
    await act(async () => {});
    await act(async () => void vi.advanceTimersByTime(1600));
    expect(result.current.status).toBe('unreachable');

    client.refreshSession.mockResolvedValue({ user: ada, accessToken: 't' });
    await act(async () => void window.dispatchEvent(new Event('online')));
    expect(result.current.status).toBe('authenticated');
  });

  it('ignores "online" events while signed in', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    const calls = client.refreshSession.mock.calls.length;
    await act(async () => void window.dispatchEvent(new Event('online')));
    expect(client.refreshSession.mock.calls.length).toBe(calls);
  });
});

describe('AuthProvider: signing in and out', () => {
  const anonymous = async () => {
    client.refreshSession.mockRejectedValue(err(401));
    const hook = setup();
    await waitFor(() => expect(hook.result.current.status).toBe('anonymous'));
    return hook;
  };

  it('login stores the token and user, and returns the user', async () => {
    endpoints.authApi.login.mockResolvedValue({ user: ada, accessToken: 'login-token' });
    const { result } = await anonymous();
    let returned;
    await act(async () => {
      returned = await result.current.login({ email: 'ada@example.com', password: 'pw' });
    });
    expect(endpoints.authApi.login).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'pw' });
    expect(client.setAccessToken).toHaveBeenCalledWith('login-token');
    expect(returned).toEqual(ada);
    expect(result.current.status).toBe('authenticated');
    expect(result.current.user).toEqual(ada);
  });

  it('a failed login passes the error on and stays signed out', async () => {
    endpoints.authApi.login.mockRejectedValue(err(401, 'INVALID_CREDENTIALS', 'Incorrect email or password'));
    const { result } = await anonymous();
    await act(async () => {
      await expect(result.current.login({ email: 'a@b.c', password: 'x' })).rejects.toThrow('Incorrect email or password');
    });
    expect(result.current.status).toBe('anonymous');
  });

  it('register signs the new user straight in', async () => {
    endpoints.authApi.register.mockResolvedValue({ user: { ...ada, onboardingCompleted: false }, accessToken: 'reg-token' });
    const { result } = await anonymous();
    await act(async () => void (await result.current.register({ name: 'Ada', email: 'a@b.c', password: 'pw' })));
    expect(result.current.status).toBe('authenticated');
    expect(result.current.user.onboardingCompleted).toBe(false);
    expect(client.setAccessToken).toHaveBeenCalledWith('reg-token');
  });

  it('logout clears everything', async () => {
    endpoints.authApi.logout.mockResolvedValue(null);
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    await act(async () => result.current.logout());
    expect(endpoints.authApi.logout).toHaveBeenCalled();
    expect(result.current.status).toBe('anonymous');
    expect(result.current.user).toBeNull();
    expect(client.setAccessToken).toHaveBeenLastCalledWith(null);
  });

  it('logout still clears this device when the server can’t be told, and passes the error on', async () => {
    endpoints.authApi.logout.mockRejectedValue(err(0, 'NETWORK', 'offline'));
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    await act(async () => {
      await expect(result.current.logout()).rejects.toThrow('offline');
    });
    expect(result.current.status).toBe('anonymous');
  });

  it('logoutEverywhere signs out here after the server revokes all sessions', async () => {
    endpoints.authApi.logoutAll.mockResolvedValue(null);
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    await act(async () => result.current.logoutEverywhere());
    expect(endpoints.authApi.logoutAll).toHaveBeenCalled();
    expect(result.current.status).toBe('anonymous');
  });

  it('logoutEverywhere keeps you signed in if the server refuses', async () => {
    endpoints.authApi.logoutAll.mockRejectedValue(err(500));
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    await act(async () => {
      await expect(result.current.logoutEverywhere()).rejects.toBeTruthy();
    });
    expect(result.current.status).toBe('authenticated');
  });

  it('setUser updates the signed-in user (e.g. after editing the profile)', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    act(() => result.current.setUser({ ...ada, name: 'Ada Lovelace' }));
    expect(result.current.user.name).toBe('Ada Lovelace');
  });
});

describe('AuthProvider: the session ending while you use the app', () => {
  it('signs out and explains why when the session was revoked or reused', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    act(() => lostHandler()(err(401, 'TOKEN_REUSE', 'Your session was ended for security reasons')));
    expect(result.current.status).toBe('anonymous');
    expect(result.current.sessionNotice).toBe('Your session was ended for security reasons');
    act(() => result.current.clearSessionNotice());
    expect(result.current.sessionNotice).toBeNull();
  });

  it('shows the notice for SESSION_REVOKED too', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    act(() => lostHandler()(err(401, 'SESSION_REVOKED', 'You were signed out on another device')));
    expect(result.current.sessionNotice).toBe('You were signed out on another device');
  });

  it('signs out quietly (no notice) for an ordinary expiry', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    act(() => lostHandler()(err(401, 'NO_SESSION', 'whatever')));
    expect(result.current.status).toBe('anonymous');
    expect(result.current.sessionNotice).toBeNull();
  });

  it('signing in again clears an old notice', async () => {
    endpoints.authApi.login.mockResolvedValue({ user: ada, accessToken: 't' });
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    act(() => lostHandler()(err(401, 'TOKEN_REUSE', 'Ended for security reasons')));
    expect(result.current.sessionNotice).toBeTruthy();
    await act(async () => void (await result.current.login({ email: 'a@b.c', password: 'pw' })));
    expect(result.current.sessionNotice).toBeNull();
  });
});

describe('useAuth', () => {
  it('refuses to work outside the provider, with a clear message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used inside AuthProvider');
    spy.mockRestore();
  });
});
