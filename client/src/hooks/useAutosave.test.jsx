import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAutosave } from './useAutosave.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const flushPromises = () => act(async () => {});

describe('useAutosave', () => {
  it('debounces rapid edits into one save with the merged changes', async () => {
    const save = vi.fn().mockResolvedValue();
    const { result } = renderHook(() => useAutosave(save, { delay: 500 }));
    act(() => result.current.markDirty({ title: 'A' }));
    act(() => result.current.markDirty({ content: 'x' }));
    act(() => result.current.markDirty({ title: 'AB' }));
    expect(result.current.state).toBe('dirty');
    await act(async () => vi.advanceTimersByTime(500));
    await flushPromises();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ title: 'AB', content: 'x' });
    expect(result.current.state).toBe('saved');
  });

  it('keeps failed changes and saves them on retry', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue();
    const { result } = renderHook(() => useAutosave(save, { delay: 100 }));
    act(() => result.current.markDirty({ content: 'v1' }));
    await act(async () => vi.advanceTimersByTime(100));
    await flushPromises();
    expect(result.current.state).toBe('error');
    await act(async () => result.current.retry());
    await flushPromises();
    expect(save).toHaveBeenLastCalledWith({ content: 'v1' });
    expect(result.current.state).toBe('saved');
  });

  it('stops autosaving on a conflict instead of overwriting', async () => {
    const conflict = Object.assign(new Error('changed elsewhere'), { code: 'NOTE_CONFLICT' });
    const save = vi.fn().mockRejectedValue(conflict);
    const { result } = renderHook(() => useAutosave(save, { delay: 100 }));
    act(() => result.current.markDirty({ content: 'mine' }));
    await act(async () => vi.advanceTimersByTime(100));
    await flushPromises();
    expect(result.current.state).toBe('conflict');
    act(() => result.current.markDirty({ content: 'more' }));
    await act(async () => vi.advanceTimersByTime(1000));
    await flushPromises();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('saves immediately on flush', async () => {
    const save = vi.fn().mockResolvedValue();
    const { result } = renderHook(() => useAutosave(save, { delay: 5000 }));
    act(() => result.current.markDirty({ title: 'now' }));
    await act(async () => result.current.flush());
    expect(save).toHaveBeenCalledWith({ title: 'now' });
  });
});
