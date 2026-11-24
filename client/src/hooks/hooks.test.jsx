import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useDebouncedValue, useProcessingPoll } from './useProcessingPoll.js';
import { usePreferences } from './usePreferences.js';
import { AuthContext } from '../context/AuthContext.jsx';
import { ToastProvider } from '../context/ToastContext.jsx';
import { screen } from '@testing-library/react';

const lib = vi.hoisted(() => ({ get: vi.fn() }));
const users = vi.hoisted(() => ({ updatePreferences: vi.fn() }));
vi.mock('../api/library.js', () => ({ libraryApi: { get: lib.get } }));
vi.mock('../api/endpoints.js', () => ({ usersApi: { updatePreferences: users.updatePreferences } }));

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers());

  it('starts with the value you give it', () => {
    const { result } = renderHook(() => useDebouncedValue('hello', 300));
    expect(result.current).toBe('hello');
  });

  it('waits for the delay before following a change', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), { initialProps: { v: 'a' } });
    rerender({ v: 'ab' });
    expect(result.current).toBe('a');
    act(() => void vi.advanceTimersByTime(299));
    expect(result.current).toBe('a');
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe('ab');
  });

  it('restarts the wait on every keystroke, so only the final value arrives', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), { initialProps: { v: '' } });
    for (const v of ['h', 'he', 'hel', 'hell', 'hello']) {
      rerender({ v });
      act(() => void vi.advanceTimersByTime(200));
    }
    expect(result.current).toBe('');
    act(() => void vi.advanceTimersByTime(300));
    expect(result.current).toBe('hello');
  });

  it('uses 300 ms when no delay is given', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v), { initialProps: { v: 1 } });
    rerender({ v: 2 });
    act(() => void vi.advanceTimersByTime(299));
    expect(result.current).toBe(1);
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe(2);
  });

  it('does not update after it is removed', () => {
    const { result, rerender, unmount } = renderHook(({ v }) => useDebouncedValue(v, 100), { initialProps: { v: 'a' } });
    rerender({ v: 'b' });
    unmount();
    expect(() => act(() => void vi.advanceTimersByTime(500))).not.toThrow();
    expect(result.current).toBe('a');
  });
});

describe('useProcessingPoll', () => {
  beforeEach(() => vi.useFakeTimers());
  const item = (id, status) => ({ id, processing: { status } });
  const tick = async (ms = 2000) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

  it('does nothing while every item is finished', async () => {
    renderHook(() => useProcessingPoll([item('a', 'ready'), item('b', 'failed')], vi.fn()));
    await tick(10_000);
    expect(lib.get).not.toHaveBeenCalled();
  });

  it('does nothing for an empty or missing list', async () => {
    renderHook(() => useProcessingPoll(undefined, vi.fn()));
    renderHook(() => useProcessingPoll([], vi.fn()));
    await tick(10_000);
    expect(lib.get).not.toHaveBeenCalled();
  });

  it('re-fetches only the busy items, without counting as “opened”, and reports each update', async () => {
    lib.get.mockImplementation(async (id) => ({ resource: { id, processing: { status: 'ready' } } }));
    const onUpdate = vi.fn();
    renderHook(() => useProcessingPoll([item('a', 'processing'), item('b', 'ready'), item('c', 'pending')], onUpdate));
    expect(lib.get).not.toHaveBeenCalled();
    await tick();
    expect(lib.get.mock.calls).toEqual([['a', { touch: false }], ['c', { touch: false }]]);
    expect(onUpdate.mock.calls.map(([r]) => r.id)).toEqual(['a', 'c']);
  });

  it('keeps going every interval while something is busy, and honours a custom interval', async () => {
    lib.get.mockImplementation(async (id) => ({ resource: item(id, 'processing') }));
    renderHook(() => useProcessingPoll([item('a', 'processing')], vi.fn(), 500));
    await tick(1600);
    expect(lib.get).toHaveBeenCalledTimes(3);
  });

  it('skips items whose fetch failed, and still reports the others', async () => {
    lib.get.mockImplementation(async (id) => {
      if (id === 'a') throw new Error('gone');
      return { resource: item(id, 'ready') };
    });
    const onUpdate = vi.fn();
    renderHook(() => useProcessingPoll([item('a', 'processing'), item('b', 'processing')], onUpdate));
    await tick();
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0].id).toBe('b');
  });

  it('stops by itself once nothing is busy any more', async () => {
    lib.get.mockResolvedValue({ resource: item('a', 'ready') });
    const { rerender } = renderHook(({ items }) => useProcessingPoll(items, vi.fn()), { initialProps: { items: [item('a', 'processing')] } });
    await tick();
    expect(lib.get).toHaveBeenCalledTimes(1);
    rerender({ items: [item('a', 'ready')] });
    await tick(10_000);
    expect(lib.get).toHaveBeenCalledTimes(1);
  });

  it('does not restart its timer when the list is re-rendered with the same busy items', async () => {
    lib.get.mockResolvedValue({ resource: item('a', 'processing') });
    const { rerender } = renderHook(({ items }) => useProcessingPoll(items, vi.fn()), { initialProps: { items: [item('a', 'processing')] } });
    await tick(1500);
    rerender({ items: [item('a', 'processing'), item('z', 'ready')] }); // new array, same busy set
    await tick(600); // 2100 ms since the start: the original timer must still fire
    expect(lib.get).toHaveBeenCalledTimes(1);
  });

  it('always calls the latest callback', async () => {
    lib.get.mockResolvedValue({ resource: item('a', 'ready') });
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useProcessingPoll([item('a', 'processing')], cb), { initialProps: { cb: first } });
    rerender({ cb: second });
    await tick();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops polling when the component goes away, and ignores answers that arrive late', async () => {
    let finish;
    lib.get.mockImplementation(() => new Promise((r) => (finish = r)));
    const onUpdate = vi.fn();
    const { unmount } = renderHook(() => useProcessingPoll([item('a', 'processing')], onUpdate));
    await tick();
    unmount();
    await act(async () => finish({ resource: item('a', 'ready') }));
    expect(onUpdate).not.toHaveBeenCalled();
    await tick(10_000);
    expect(lib.get).toHaveBeenCalledTimes(1);
  });
});

describe('usePreferences', () => {
  const baseUser = () => ({ id: 'u1', name: 'Ada', preferences: { reduceMotion: false, ai: { defaultMode: 'general', responseStyle: 'balanced' }, library: { defaultView: 'grid', defaultSort: 'updated' } } });

  const setup = (user = baseUser()) => {
    const setUser = vi.fn();
    const wrapper = ({ children }) => (
      <AuthContext.Provider value={{ user, setUser }}>
        <ToastProvider>{children}</ToastProvider>
      </AuthContext.Provider>
    );
    return { ...renderHook(() => usePreferences(), { wrapper }), setUser, user };
  };

  it('exposes the current preferences', () => {
    const { result, user } = setup();
    expect(result.current.preferences).toBe(user.preferences);
    expect(result.current.saving).toBe(false);
  });

  it('applies the change at once (merging into nested settings), then keeps the server’s version', async () => {
    let finish;
    users.updatePreferences.mockImplementation(() => new Promise((r) => (finish = r)));
    const { result, setUser } = setup();
    let pending;
    act(() => void (pending = result.current.save({ ai: { defaultMode: 'hybrid' } })));
    // Optimistic: only the one nested setting changes, everything else is kept.
    expect(setUser).toHaveBeenCalledTimes(1);
    const optimistic = setUser.mock.calls[0][0];
    expect(optimistic.preferences.ai).toEqual({ defaultMode: 'hybrid', responseStyle: 'balanced' });
    expect(optimistic.preferences.library).toEqual({ defaultView: 'grid', defaultSort: 'updated' });
    expect(optimistic.preferences.reduceMotion).toBe(false);
    expect(result.current.saving).toBe(true);
    expect(users.updatePreferences).toHaveBeenCalledWith({ ai: { defaultMode: 'hybrid' } });

    const serverUser = { ...baseUser(), name: 'From server' };
    await act(async () => {
      finish({ user: serverUser });
      await pending;
    });
    expect(setUser).toHaveBeenLastCalledWith(serverUser);
    expect(result.current.saving).toBe(false);
  });

  it('merges top-level settings and library settings too', async () => {
    users.updatePreferences.mockResolvedValue({ user: baseUser() });
    const { result, setUser } = setup();
    await act(async () => result.current.save({ reduceMotion: true, library: { defaultView: 'list' } }));
    const optimistic = setUser.mock.calls[0][0];
    expect(optimistic.preferences.reduceMotion).toBe(true);
    expect(optimistic.preferences.library).toEqual({ defaultView: 'list', defaultSort: 'updated' });
    expect(optimistic.preferences.ai).toEqual({ defaultMode: 'general', responseStyle: 'balanced' });
  });

  it('tells you it saved', async () => {
    users.updatePreferences.mockResolvedValue({ user: baseUser() });
    const { result } = setup();
    await act(async () => result.current.save({ reduceMotion: true }));
    expect(screen.getByText('Preferences saved')).toBeInTheDocument();
  });

  it('can use a different message, or stay quiet', async () => {
    users.updatePreferences.mockResolvedValue({ user: baseUser() });
    const { result } = setup();
    await act(async () => result.current.save({ reduceMotion: true }, { successMessage: 'Theme changed' }));
    expect(screen.getByText('Theme changed')).toBeInTheDocument();
    await act(async () => result.current.save({ reduceMotion: false }, { successMessage: null }));
    expect(screen.queryByText('Preferences saved')).toBeNull();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('puts things back and explains if the server refuses', async () => {
    users.updatePreferences.mockRejectedValue(new Error('Could not reach the Mindmesh server.'));
    const { result, setUser, user } = setup();
    await act(async () => result.current.save({ ai: { defaultMode: 'hybrid' } }));
    expect(setUser).toHaveBeenCalledTimes(2);
    expect(setUser.mock.calls[1][0]).toBe(user); // rolled back to exactly what it was
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save: Could not reach the Mindmesh server.");
    expect(result.current.saving).toBe(false);
  });
});
