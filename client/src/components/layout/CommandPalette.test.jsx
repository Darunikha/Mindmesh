import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import CommandPalette, { openPalette } from './CommandPalette.jsx';
import { Providers } from '../../test/utils.jsx';

const suggest = vi.fn();
vi.mock('../../api/discovery.js', () => ({ searchApi: { suggest: (...a) => suggest(...a) } }));

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}
const setup = () =>
  render(
    <Providers>
      <CommandPalette />
      <Where />
    </Providers>
  );
const press = (init) => act(() => void fireEvent.keyDown(document, { key: 'k', ...init }));

afterEach(() => {
  cleanup();
  suggest.mockReset();
  vi.useRealTimers();
});

describe('CommandPalette', () => {
  it('opens with Ctrl+K and closes with Escape', () => {
    setup();
    expect(screen.queryByRole('dialog')).toBeNull();
    press({ ctrlKey: true });
    expect(screen.getByRole('dialog', { name: 'Quick jump' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    return vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('opens with Cmd+K and from the openPalette helper', () => {
    setup();
    press({ metaKey: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    press({ metaKey: true });
    return vi.waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      act(() => openPalette());
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('filters pages and opens the chosen one with the keyboard', () => {
    setup();
    press({ ctrlKey: true });
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'timel' } });
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveTextContent('Timeline');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('where')).toHaveTextContent('/timeline');
  });

  it('moves the highlight with the arrow keys', () => {
    setup();
    press({ ctrlKey: true });
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('looks up the user’s own items and links to them', async () => {
    vi.useFakeTimers();
    suggest.mockResolvedValue({ resources: [{ id: 'abc123', title: 'Quantum notes', type: 'note' }], collections: [{ id: 'c1', name: 'Quantum course' }], tags: [{ id: 't1', name: 'quantum' }] });
    setup();
    press({ ctrlKey: true });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'quan' } });
    await act(async () => vi.advanceTimersByTime(250));
    expect(suggest).toHaveBeenCalledWith('quan', expect.any(Object));
    fireEvent.click(screen.getByRole('option', { name: /Quantum notes/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/vault/abc123');
  });

  it('always offers a full search for what was typed', () => {
    setup();
    press({ ctrlKey: true });
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'zzzz' } });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Search everything for “zzzz”');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('where')).toHaveTextContent('/search?q=zzzz');
  });
});
