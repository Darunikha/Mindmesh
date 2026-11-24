import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ReviewSession from './ReviewSession.jsx';
import { ThemeContext } from '../../context/ThemeContext.jsx';

const api = vi.hoisted(() => ({ due: vi.fn(), review: vi.fn() }));
vi.mock('../../api/chat.js', () => ({ flashcardsApi: api }));

afterEach(cleanup);

const card = (n, extra = {}) => ({
  id: `c${n}`,
  front: `Question ${n}`,
  back: `Answer ${n}`,
  isNew: false,
  reviewCount: 3,
  resourceId: null,
  resourceTitle: null,
  previews: { again: '10m', hard: '1d', good: '3d', easy: '7d' },
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.review.mockImplementation(async (id) => ({ card: { ...card(Number(id.slice(1))), reviewCount: 4 } }));
});

function show({ cards = [card(1), card(2)], remaining = cards.length, props = {}, theme = 'studio' } = {}) {
  api.due.mockResolvedValue({ cards, remaining });
  return render(
    <ThemeContext.Provider value={{ theme, setTheme: () => {} }}>
      <MemoryRouter>
        <ReviewSession {...props} />
      </MemoryRouter>
    </ThemeContext.Provider>
  );
}

// Let React finish attaching its key listener first, as a person always would, then press the key.
const press = async (init) => {
  await act(async () => {});
  fireEvent.keyDown(document.body, init);
};

const reveal = async (user) => user.click(await screen.findByRole('button', { name: /show answer/i }));

describe('ReviewSession: starting', () => {
  it('shows a placeholder while loading, then the first question without its answer', async () => {
    show();
    expect(screen.queryByText('Question 1')).toBeNull();
    expect(await screen.findByText('Question 1')).toBeInTheDocument();
    expect(screen.queryByText('Answer 1')).toBeNull();
    expect(screen.getByText('Question')).toBeInTheDocument();
    expect(screen.getByText(/0 reviewed · 2 in this session/)).toBeInTheDocument();
  });

  it('asks for up to 20 due cards, optionally only for one item', async () => {
    show({ props: { resourceId: 'r9' } });
    await screen.findByText('Question 1');
    expect(api.due).toHaveBeenCalledWith({ limit: 20, resourceId: 'r9' });
  });

  it('labels brand-new cards, in each theme’s voice', async () => {
    const { unmount } = show({ cards: [card(1, { isNew: true })] });
    expect(await screen.findByText('New card')).toBeInTheDocument();
    unmount();
    show({ cards: [card(1, { isNew: true })], theme: 'lab' });
    expect(await screen.findByText('NEW CARD')).toBeInTheDocument();
  });

  it('links back to the note a card came from', async () => {
    show({ cards: [card(1, { resourceId: 'r7', resourceTitle: 'Photosynthesis' })] });
    expect(await screen.findByRole('link', { name: 'From: Photosynthesis' })).toHaveAttribute('href', '/vault/r7');
  });

  it('says how many more are due beyond this session', async () => {
    show({ cards: [card(1), card(2)], remaining: 5 });
    expect(await screen.findByText(/3 more due/)).toBeInTheDocument();
  });

  it('shows an error if the cards can’t be loaded', async () => {
    api.due.mockRejectedValue(new Error('Could not reach the Mindmesh server.'));
    render(
      <ThemeContext.Provider value={{ theme: 'studio', setTheme: () => {} }}>
        <MemoryRouter>
          <ReviewSession />
        </MemoryRouter>
      </ThemeContext.Provider>
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the Mindmesh server.');
  });

  it('says so, and offers a way to make cards, when nothing is due', async () => {
    show({ cards: [], remaining: 0 });
    expect(await screen.findByText('Nothing due right now')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /make cards from your notes/i })).toHaveAttribute('href', '/vault');
  });
});

describe('ReviewSession: revealing and grading with the mouse', () => {
  it('reveals the answer, then shows the four grades with their next-review times', async () => {
    const user = userEvent.setup();
    show();
    await reveal(user);
    expect(screen.getByText('Answer 1')).toBeInTheDocument();
    const group = screen.getByRole('group', { name: 'How well did you remember?' });
    expect(group).toHaveTextContent('Again');
    expect(group).toHaveTextContent('10m · 1');
    expect(group).toHaveTextContent('1d · 2');
    expect(group).toHaveTextContent('3d · 3');
    expect(group).toHaveTextContent('7d · 4');
    expect(screen.queryByRole('button', { name: /show answer/i })).toBeNull();
  });

  it('grading moves on to the next card, hides its answer, and counts the review', async () => {
    const user = userEvent.setup();
    const onReviewed = vi.fn();
    show({ props: { onReviewed } });
    await reveal(user);
    await user.click(screen.getByRole('button', { name: /good/i }));
    expect(await screen.findByText('Question 2')).toBeInTheDocument();
    expect(api.review).toHaveBeenCalledWith('c1', 'good');
    expect(onReviewed).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Answer 2')).toBeNull();
    expect(screen.getByText(/1 reviewed · 1 in this session/)).toBeInTheDocument();
  });

  it('finishes with a summary, and offers to continue when more are due', async () => {
    const user = userEvent.setup();
    show({ cards: [card(1)], remaining: 4 });
    await reveal(user);
    await user.click(screen.getByRole('button', { name: /easy/i }));
    expect(await screen.findByText('Session complete: 1 review')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with 3 more' })).toBeInTheDocument();
    api.due.mockResolvedValue({ cards: [card(5)], remaining: 3 });
    await user.click(screen.getByRole('button', { name: 'Continue with 3 more' }));
    expect(await screen.findByText('Question 5')).toBeInTheDocument();
  });

  it('uses the right wording for several reviews and when nothing more is due', async () => {
    const user = userEvent.setup();
    show({ cards: [card(1), card(2)] });
    for (let i = 0; i < 2; i++) {
      await reveal(user);
      await user.click(screen.getByRole('button', { name: /good/i }));
    }
    expect(await screen.findByText('Session complete: 2 reviews')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /make cards/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue with/i })).toBeNull();
  });

  it('“Again” brings the same card back at the end of the session', async () => {
    const user = userEvent.setup();
    show({ cards: [card(1), card(2)] });
    await reveal(user);
    await user.click(screen.getByRole('button', { name: /again/i }));
    expect(await screen.findByText('Question 2')).toBeInTheDocument();
    await reveal(user);
    await user.click(screen.getByRole('button', { name: /good/i }));
    expect(await screen.findByText('Question 1')).toBeInTheDocument();
    expect(screen.getByText(/2 reviewed · 1 in this session/)).toBeInTheDocument();
  });

  it('keeps the remaining count when a card lapses, and lowers it when one is passed', async () => {
    const user = userEvent.setup();
    show({ cards: [card(1), card(2)], remaining: 5 });
    await screen.findByText(/3 more due/);
    await reveal(user);
    await user.click(screen.getByRole('button', { name: /again/i }));
    await screen.findByText('Question 2');
    expect(screen.getByText(/3 more due/)).toBeInTheDocument();
    await reveal(user);
    await user.click(screen.getByRole('button', { name: /good/i }));
    await screen.findByText('Question 1');
    expect(screen.getByText(/2 reviewed/)).toBeInTheDocument();
  });

  it('shows an error and keeps the card if saving the review fails', async () => {
    const user = userEvent.setup();
    api.review.mockRejectedValueOnce(new Error('Could not save your review'));
    show();
    await reveal(user);
    await user.click(screen.getByRole('button', { name: /good/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your review');
    expect(screen.getByText('Question 1')).toBeInTheDocument();
    expect(screen.getByText('Answer 1')).toBeInTheDocument();
    expect(screen.getByText(/0 reviewed/)).toBeInTheDocument();
  });
});

describe('ReviewSession: keyboard', () => {
  it('Space shows the answer', async () => {
    show();
    await screen.findByText('Question 1');
    await press({ code: 'Space', key: ' ' });
    expect(await screen.findByText('Answer 1')).toBeInTheDocument();
  });

  it.each([
    ['1', 'again'],
    ['2', 'hard'],
    ['3', 'good'],
    ['4', 'easy'],
  ])('%s grades the card “%s”', async (key, grade) => {
    show();
    await screen.findByText('Question 1');
    await press({ code: 'Space', key: ' ' });
    await screen.findByText('Answer 1');
    await press({ key });
    await waitFor(() => expect(api.review).toHaveBeenCalledWith('c1', grade));
  });

  it('number keys do nothing until the answer has been shown', async () => {
    show();
    await screen.findByText('Question 1');
    await press({ key: '3' });
    expect(api.review).not.toHaveBeenCalled();
  });

  it('other keys do nothing', async () => {
    show();
    await screen.findByText('Question 1');
    await press({ code: 'Space', key: ' ' });
    await screen.findByText('Answer 1');
    for (const key of ['5', '0', 'a', 'Enter']) await press({ key });
    expect(api.review).not.toHaveBeenCalled();
  });

  it('is ignored while typing in a text field (so shortcuts never eat your typing)', async () => {
    render(
      <>
        <input aria-label="Search box" />
      </>
    );
    show();
    await screen.findByText('Question 1');
    const input = screen.getByLabelText('Search box');
    input.focus();
    fireEvent.keyDown(input, { code: 'Space', key: ' ' });
    expect(screen.queryByText('Answer 1')).toBeNull();
  });

  it('grades only once if a key is pressed twice before the server replies', async () => {
    let finish;
    api.review.mockImplementationOnce(() => new Promise((r) => (finish = r)));
    show();
    await screen.findByText('Question 1');
    await press({ code: 'Space', key: ' ' });
    await screen.findByText('Answer 1');
    await press({ key: '3' });
    await press({ key: '3' });
    expect(api.review).toHaveBeenCalledTimes(1);
    finish({ card: card(1) });
    await screen.findByText('Question 2');
  });

  it('does nothing when there are no cards', async () => {
    show({ cards: [], remaining: 0 });
    await screen.findByText('Nothing due right now');
    await press({ code: 'Space', key: ' ' });
    await press({ key: '3' });
    expect(api.review).not.toHaveBeenCalled();
  });
});
