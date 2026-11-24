import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from './ToastContext.jsx';

// These tests are about the toast logic (what shows, for how long, what gets dropped), not the animation
// library. A plain pass-through keeps them instant and independent of how busy the machine is.
vi.mock('framer-motion', async () => {
  const React = await import('react');
  const strip = ({ initial, animate, exit, transition, layout, ...rest }) => rest;
  const motion = new Proxy({}, { get: (_t, tag) => React.forwardRef((props, ref) => React.createElement(tag, { ...strip(props), ref })) });
  return { motion, AnimatePresence: ({ children }) => children };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const setup = () => {
  const hook = renderHook(() => useToast(), { wrapper: ToastProvider });
  return hook;
};

describe('toasts', () => {
  it('shows a success message politely, in a labelled notifications area', () => {
    const { result } = setup();
    act(() => void result.current.success('Saved'));
    expect(screen.getByRole('region', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it('announces errors assertively', () => {
    const { result } = setup();
    act(() => void result.current.error('Could not save'));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
  });

  it('info messages are polite too', () => {
    const { result } = setup();
    act(() => void result.current.info('FYI'));
    expect(screen.getByRole('status')).toHaveTextContent('FYI');
  });

  it('goes away by itself after a few seconds', async () => {
    const { result } = setup();
    act(() => void result.current.success('Saved', { duration: 60 }));
    expect(screen.getByText('Saved')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Saved')).toBeNull(), { timeout: 3000 });
  });

  it('uses a sensible default time (about four seconds)', () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(globalThis, 'setTimeout');
    const { result } = setup();
    act(() => void result.current.success('Saved'));
    expect(spy.mock.calls.some(([, ms]) => ms === 4200)).toBe(true);
    spy.mockRestore();
  });

  it('stays until dismissed when the duration is 0', async () => {
    const { result } = setup();
    act(() => void result.current.error('Important', { duration: 0 }));
    await new Promise((r) => setTimeout(r, 120));
    expect(screen.getByText('Important')).toBeInTheDocument();
  });

  it('can be dismissed with its button', async () => {
    const user = userEvent.setup();
    const { result } = setup();
    act(() => void result.current.info('Hello', { duration: 0 }));
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    await waitFor(() => expect(screen.queryByText('Hello')).toBeNull());
  });

  it('can be dismissed from code using the id it returned', async () => {
    const { result } = setup();
    let id;
    act(() => void (id = result.current.info('Working…', { duration: 0 })));
    expect(typeof id).toBe('number');
    act(() => result.current.dismiss(id));
    await waitFor(() => expect(screen.queryByText('Working…')).toBeNull());
  });

  it('gives each message its own id, so dismissing one leaves the others', async () => {
    const { result } = setup();
    let a;
    let b;
    act(() => {
      a = result.current.info('First', { duration: 0 });
      b = result.current.info('Second', { duration: 0 });
    });
    expect(a).not.toBe(b);
    act(() => result.current.dismiss(a));
    await waitFor(() => expect(screen.queryByText('First')).toBeNull());
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('never stacks more than four at once; the oldest is dropped', async () => {
    const { result } = setup();
    act(() => {
      for (let i = 1; i <= 6; i++) result.current.info(`Message ${i}`, { duration: 0 });
    });
    await waitFor(() => expect(screen.queryByText('Message 1')).toBeNull());
    expect(screen.queryByText('Message 2')).toBeNull();
    for (const n of [3, 4, 5, 6]) expect(screen.getByText(`Message ${n}`)).toBeInTheDocument();
  });

  it('keeps the same functions between renders, so effects that use them don’t re-run', () => {
    const { result, rerender } = setup();
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('refuses to be used outside its provider, with a clear message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useToast())).toThrow('useToast must be used inside ToastProvider');
    spy.mockRestore();
  });

  it('renders its children', () => {
    render(
      <ToastProvider>
        <p>App content</p>
      </ToastProvider>
    );
    expect(screen.getByText('App content')).toBeInTheDocument();
  });
});
