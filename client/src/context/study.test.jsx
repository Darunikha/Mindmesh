import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { dueBadge, StudyContext } from './StudyContext.jsx';
import DueBadge from '../components/layout/DueBadge.jsx';

afterEach(cleanup);

describe('dueBadge', () => {
  it('shows a count, caps large numbers, and hides when nothing is due', () => {
    expect(dueBadge(0)).toBeNull();
    expect(dueBadge(undefined)).toBeNull();
    expect(dueBadge(7)).toBe('7');
    expect(dueBadge(99)).toBe('99');
    expect(dueBadge(150)).toBe('99+');
  });
});

describe('DueBadge', () => {
  const show = (stats) =>
    render(
      <StudyContext.Provider value={{ stats, refresh: () => {} }}>
        <DueBadge />
      </StudyContext.Provider>
    );

  it('announces how many cards are due', () => {
    show({ due: 3 });
    expect(screen.getByRole('status')).toHaveTextContent('3');
    expect(screen.getByLabelText('3 flashcards due')).toBeInTheDocument();
  });

  it('uses the singular for one card', () => {
    show({ due: 1 });
    expect(screen.getByLabelText('1 flashcard due')).toBeInTheDocument();
  });

  it('renders nothing when no cards are due or stats are not loaded yet', () => {
    const { container } = show({ due: 0 });
    expect(container).toBeEmptyDOMElement();
    cleanup();
    expect(show(null).container).toBeEmptyDOMElement();
  });
});
