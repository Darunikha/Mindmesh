import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import Dialog from './Dialog.jsx';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

/** A page with a button that opens the dialog, like real usage. */
function Page({ onClose = () => {}, footer, description, tone, children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open it</button>
      <Dialog
        open={open}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        title="Delete note?"
        description={description}
        footer={footer}
        tone={tone}
      >
        {children ?? (
          <>
            <input aria-label="First field" />
            <input aria-label="Second field" />
          </>
        )}
      </Dialog>
    </>
  );
}

const open = async (user) => {
  await user.click(screen.getByRole('button', { name: 'Open it' }));
  return screen.findByRole('dialog');
};

describe('Dialog', () => {
  it('renders nothing while closed', () => {
    render(<Page />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a modal dialog named by its title and described by its description', async () => {
    const user = userEvent.setup();
    render(<Page description="This cannot be undone." />);
    const dialog = await open(user);
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Delete note?');
    expect(dialog).toHaveAccessibleDescription('This cannot be undone.');
  });

  it('has no description attribute when there is no description', async () => {
    const user = userEvent.setup();
    render(<Page />);
    expect((await open(user)).getAttribute('aria-describedby')).toBeNull();
  });

  it('shows its footer buttons', async () => {
    const user = userEvent.setup();
    render(<Page footer={<button>Confirm delete</button>} />);
    await open(user);
    expect(screen.getByRole('button', { name: 'Confirm delete' })).toBeInTheDocument();
  });

  it('moves keyboard focus into the dialog when it opens', async () => {
    const user = userEvent.setup();
    render(<Page />);
    await open(user);
    await waitFor(() => expect(screen.getByLabelText('First field')).toHaveFocus());
  });

  it('closes with Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Page onClose={onClose} />);
    await open(user);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes when you click the dark backdrop, but not when you click inside', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Page onClose={onClose} />);
    const dialog = await open(user);
    await user.click(dialog);
    await user.click(screen.getByLabelText('First field'));
    expect(onClose).not.toHaveBeenCalled();
    await user.click(dialog.parentElement.querySelector('[aria-hidden="true"]'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes with its close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Page onClose={onClose} />);
    await open(user);
    await user.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab inside the dialog, wrapping from the last control to the first', async () => {
    const user = userEvent.setup();
    render(<Page footer={<button>Confirm</button>} />);
    await open(user);
    const close = screen.getByRole('button', { name: 'Close dialog' });
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    await waitFor(() => expect(screen.getByLabelText('First field')).toHaveFocus());
    confirm.focus();
    await user.tab();
    // Close sits last in the DOM so Tab from "Confirm" lands on it, and one more Tab wraps round.
    expect(close).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('First field')).toHaveFocus();
  });

  it('keeps Shift+Tab inside the dialog, wrapping from the first control to the last', async () => {
    const user = userEvent.setup();
    render(<Page footer={<button>Confirm</button>} />);
    await open(user);
    await waitFor(() => expect(screen.getByLabelText('First field')).toHaveFocus());
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();
  });

  it('stops the page behind from scrolling, and restores it afterwards', async () => {
    const user = userEvent.setup();
    document.body.style.overflow = 'auto';
    render(<Page />);
    await open(user);
    expect(document.body.style.overflow).toBe('hidden');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.body.style.overflow).toBe('auto'));
  });

  it('returns focus to the button that opened it', async () => {
    const user = userEvent.setup();
    render(<Page />);
    const trigger = screen.getByRole('button', { name: 'Open it' });
    await open(user);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('focuses the dialog itself when it has nothing focusable inside except the close button', async () => {
    const user = userEvent.setup();
    render(<Page>{<p>Just text</p>}</Page>);
    await open(user);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus());
  });

  it('a danger dialog styles its title as a warning', async () => {
    const user = userEvent.setup();
    render(<Page tone="danger" />);
    await open(user);
    expect(screen.getByRole('heading', { name: 'Delete note?' }).className).toMatch(/text-danger/);
  });

  it('ignores other keys, and Escape does nothing while closed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Page onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    await open(user);
    await user.keyboard('a');
    expect(onClose).not.toHaveBeenCalled();
  });
});
