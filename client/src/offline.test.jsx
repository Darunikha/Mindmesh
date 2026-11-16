import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { networkError, isNetworkError } from './api/client.js';
import { useAutosave } from './hooks/useAutosave.js';
import OfflineBanner from './components/layout/OfflineBanner.jsx';
import SaveIndicator from './components/editor/SaveIndicator.jsx';
import NotFoundPage, { guessSearch } from './pages/NotFoundPage.jsx';
import { Providers } from './test/utils.jsx';

const setOnline = (value) => Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });

afterEach(() => {
  cleanup();
  setOnline(true);
  vi.useRealTimers();
});

describe('networkError', () => {
  it('says "offline" when the browser is offline', () => {
    setOnline(false);
    const err = networkError();
    expect(err.code).toBe('OFFLINE');
    expect(err.message).toMatch(/offline/i);
    expect(isNetworkError(err)).toBe(true);
  });

  it('blames the connection or server when the browser thinks it is online', () => {
    setOnline(true);
    const err = networkError();
    expect(err.code).toBe('NETWORK');
    expect(isNetworkError(err)).toBe(true);
    expect(isNetworkError({ code: 'VALIDATION' })).toBe(false);
  });
});

describe('autosave and reconnecting', () => {
  beforeEach(() => vi.useFakeTimers());

  it('retries a save that failed because of the network once the connection returns', async () => {
    setOnline(false);
    const save = vi.fn().mockRejectedValueOnce(networkError()).mockResolvedValue();
    const { result } = renderHook(() => useAutosave(save, { delay: 100 }));
    act(() => result.current.markDirty({ content: 'x' }));
    await act(async () => vi.advanceTimersByTime(100));
    await act(async () => {});
    expect(result.current.state).toBe('error');

    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await act(async () => {});
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe('saved');
  });

  it('does not auto-retry other kinds of failures', async () => {
    const save = vi.fn().mockRejectedValue(Object.assign(new Error('bad'), { code: 'VALIDATION' }));
    const { result } = renderHook(() => useAutosave(save, { delay: 100 }));
    act(() => result.current.markDirty({ content: 'x' }));
    await act(async () => vi.advanceTimersByTime(100));
    await act(async () => {});
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('error');
  });
});

describe('SaveIndicator', () => {
  it('shows an offline message for network errors', () => {
    render(<SaveIndicator state="error" error={{ code: 'OFFLINE' }} onRetry={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent('Offline, will retry');
  });

  it('shows "Not saved" for other errors', () => {
    render(<SaveIndicator state="error" error={{ code: 'VALIDATION' }} onRetry={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent('Not saved');
  });
});

describe('OfflineBanner', () => {
  it('appears when offline and briefly confirms when back online', () => {
    vi.useFakeTimers();
    setOnline(true);
    render(
      <Providers>
        <OfflineBanner />
      </Providers>
    );
    expect(screen.queryByRole('status')).toBeNull();

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('status')).toHaveTextContent(/offline/i);

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByRole('status')).toHaveTextContent(/back online/i);

    act(() => vi.advanceTimersByTime(3500));
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('NotFoundPage', () => {
  it('guesses a search from the missing path', () => {
    expect(guessSearch('/vault/my-great_note')).toBe('my great note');
    expect(guessSearch('/')).toBe('');
  });

  it('shows the missing path and a prefilled search', () => {
    render(
      <Providers route="/vault/lost-note">
        <Routes>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Providers>
    );
    expect(screen.getByText('/vault/lost-note')).toBeInTheDocument();
    const input = screen.getByPlaceholderText(/search your notes/i);
    expect(input).toHaveValue('lost note');
    fireEvent.change(input, { target: { value: 'something else' } });
    expect(input).toHaveValue('something else');
  });
});
