import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import ConversationList from './ConversationList.jsx';
import { Providers } from '../../test/utils.jsx';

afterEach(cleanup);

const now = new Date().toISOString();
const old = new Date(Date.now() - 40 * 86400000).toISOString();
const make = (id, title, extra = {}) => ({ id, title, mode: 'general', messageCount: 2, lastMessageAt: now, generating: false, pinned: false, ...extra });

const setup = (conversations, props = {}) => {
  const handlers = { onNew: vi.fn(), onRename: vi.fn(), onDelete: vi.fn(), onPin: vi.fn(), onNavigate: vi.fn() };
  render(
    <Providers>
      <ConversationList conversations={conversations} loading={false} {...handlers} {...props} />
    </Providers>
  );
  return handlers;
};

describe('ConversationList pinning', () => {
  it('shows pinned conversations in their own group at the top, even if they are old', () => {
    setup([make('1', 'Fresh chat'), make('2', 'Old but pinned', { pinned: true, lastMessageAt: old }), make('3', 'Ancient', { lastMessageAt: old })]);
    const labels = screen.getAllByText(/^(Pinned|Today|Older)$/).map((n) => n.textContent);
    expect(labels).toEqual(['Pinned', 'Today', 'Older']);
    const nav = screen.getByRole('navigation', { name: 'Conversations' });
    const links = within(nav).getAllByRole('link').map((a) => a.textContent);
    expect(links).toEqual(['Old but pinned', 'Fresh chat', 'Ancient']);
    expect(screen.getAllByLabelText('Pinned')).toHaveLength(1);
  });

  it('puts a just-unpinned chat back in date order instead of leaving it on top', () => {
    // The page keeps the list in the order it was loaded, so an unpinned old chat can still be first.
    setup([make('2', 'Was pinned', { lastMessageAt: old }), make('1', 'Fresh chat')]);
    const nav = screen.getByRole('navigation', { name: 'Conversations' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Fresh chat', 'Was pinned']);
    expect(screen.queryByText('Pinned')).toBeNull();
  });

  it('has no Pinned group when nothing is pinned', () => {
    setup([make('1', 'A'), make('2', 'B')]);
    expect(screen.queryByText('Pinned')).toBeNull();
  });

  it('offers Pin for an unpinned chat and Unpin for a pinned one, and reports the click', () => {
    const { onPin } = setup([make('1', 'Plain'), make('2', 'Starred', { pinned: true })]);
    fireEvent.click(screen.getByRole('button', { name: 'Pin Plain' }));
    expect(onPin).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unpin Starred' }));
    expect(onPin).toHaveBeenCalledWith(expect.objectContaining({ id: '2', pinned: true }));
    expect(screen.getByRole('button', { name: 'Unpin Starred' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps pinned chats grouped when searching', () => {
    setup([make('1', 'Physics notes', { pinned: true, lastMessageAt: old }), make('2', 'Physics homework'), make('3', 'Cooking')]);
    fireEvent.change(screen.getByLabelText('Search conversations'), { target: { value: 'physics' } });
    const nav = screen.getByRole('navigation', { name: 'Conversations' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Physics notes', 'Physics homework']);
    expect(screen.getByText('Pinned')).toBeInTheDocument();
  });

  it('does not render a pin button when no handler is given', () => {
    setup([make('1', 'Plain')], { onPin: undefined });
    expect(screen.queryByRole('button', { name: /^Pin / })).toBeNull();
  });
});
