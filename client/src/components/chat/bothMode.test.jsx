import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ModeSwitch } from './Composer.jsx';
import MessageItem from './MessageItem.jsx';
import ChoiceCards from '../ui/ChoiceCards.jsx';
import { ANSWER_MODES, ANSWER_MODE_OPTIONS, normalizeMode } from '../../lib/aiModes.js';
import { Providers } from '../../test/utils.jsx';

afterEach(cleanup);

describe('answer mode options', () => {
  it('offers General AI, My Knowledge and Both, in that order', () => {
    expect(ANSWER_MODE_OPTIONS.map((o) => [o.value, o.label])).toEqual([
      ['general', 'General AI'],
      ['knowledge', 'My Knowledge'],
      ['hybrid', 'Both'],
    ]);
    for (const o of ANSWER_MODE_OPTIONS) {
      expect(o.description.length).toBeGreaterThan(20);
      expect(o.icon).toBeTruthy();
    }
  });

  it('keeps a saved "Both" and falls back to My Knowledge for anything unknown', () => {
    expect(ANSWER_MODES).toEqual(['general', 'knowledge', 'hybrid']);
    expect(normalizeMode('hybrid')).toBe('hybrid');
    expect(normalizeMode('general')).toBe('general');
    expect(normalizeMode('knowledge')).toBe('knowledge');
    expect(normalizeMode(undefined)).toBe('knowledge');
    expect(normalizeMode('nonsense')).toBe('knowledge');
  });
});

describe('Both in the onboarding / settings cards', () => {
  function Harness({ onPick }) {
    const [value, setValue] = useState('general');
    return (
      <ChoiceCards
        columns={3}
        label="Default answer mode"
        value={value}
        onChange={(v) => {
          setValue(v);
          onPick(v);
        }}
        options={ANSWER_MODE_OPTIONS}
      />
    );
  }

  it('shows three cards and lets you pick Both', () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(screen.getByRole('radio', { name: /General AI/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /Both/ }));
    expect(onPick).toHaveBeenCalledWith('hybrid');
    expect(screen.getByRole('radio', { name: /Both/ })).toBeChecked();
    expect(screen.getByText(/when they are relevant, and general knowledge when they are not/)).toBeInTheDocument();
  });

  it('arrow keys reach the new card', () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    fireEvent.keyDown(screen.getByRole('radio', { name: /General AI/ }), { key: 'ArrowLeft' }); // wraps round to the last card
    expect(onPick).toHaveBeenCalledWith('hybrid');
  });
});

describe('chat mode switch', () => {
  it('has a Both option that reports "hybrid"', () => {
    const onChange = vi.fn();
    render(<ModeSwitch mode="general" onChange={onChange} />);
    expect(screen.getAllByRole('radio').map((r) => r.textContent.trim())).toEqual(['General AI', 'My Knowledge', 'Both']);
    fireEvent.click(screen.getByRole('radio', { name: /Both/ }));
    expect(onChange).toHaveBeenCalledWith('hybrid');
  });

  it('marks the active mode', () => {
    render(<ModeSwitch mode="hybrid" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: /Both/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /General AI/ })).toHaveAttribute('aria-checked', 'false');
  });
});

describe('answer badge for Both', () => {
  const message = (extra = {}) => ({
    id: 'm1',
    role: 'assistant',
    kind: 'message',
    mode: 'hybrid',
    content: 'An answer.',
    status: 'complete',
    citations: [],
    followUps: [],
    retrieval: null,
    createdAt: '2026-01-01T00:00:00Z',
    ...extra,
  });
  const show = (m) =>
    render(
      <Providers>
        <MessageItem message={m} streaming={false} isLast={false} canRegenerate={false} />
      </Providers>
    );

  it('says "Both" when nothing was searched (an empty library)', () => {
    show(message());
    expect(screen.getByText('Both')).toBeInTheDocument();
  });

  it('says so when sources were searched but none matched', () => {
    show(message({ retrieval: { searched: true, found: 0 } }));
    expect(screen.getByText('Both · no matching sources, general knowledge')).toBeInTheDocument();
  });

  it('says so when sources were found but not cited', () => {
    show(message({ retrieval: { searched: true, found: 3 } }));
    expect(screen.getByText('Both · sources searched, none cited')).toBeInTheDocument();
  });

  it('counts the sources that were actually cited', () => {
    const c = (n, cited) => ({ n, resourceId: `r${n}`, resourceType: 'note', title: `S${n}`, excerpt: 'x', cited });
    show(message({ retrieval: { searched: true, found: 2 }, citations: [c(1, true), c(2, false)] }));
    expect(screen.getByText('Both · grounded in 1 of your source')).toBeInTheDocument();
  });
});
