import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountSection from './AccountSection.jsx';
import { ToastProvider } from '../../context/ToastContext.jsx';
import { Providers } from '../../test/utils.jsx';

const fetchBlob = vi.fn();
vi.mock('../../api/client.js', async (original) => ({ ...(await original()), fetchBlob: (...a) => fetchBlob(...a) }));

let saved;
beforeEach(() => {
  saved = [];
  URL.createObjectURL = vi.fn(() => 'blob:export');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
    saved.push(this.download);
  });
});
afterEach(() => {
  cleanup();
  fetchBlob.mockReset();
  vi.restoreAllMocks();
});

const setup = () => {
  render(
    <Providers user={{ id: 'u1', email: 'ada@example.com', createdAt: '2026-01-01T00:00:00Z' }}>
      <ToastProvider>
        <AccountSection />
      </ToastProvider>
    </Providers>
  );
  return userEvent.setup();
};

describe('downloading your data', () => {
  it.each([
    ['Download with files (.zip)', '/users/me/export?files=true', /^mindmesh-export-\d{4}-\d\d-\d\d\.zip$/],
    ['Data only (.json)', '/users/me/export', /^mindmesh-export-\d{4}-\d\d-\d\d\.json$/],
  ])('“%s” saves the right file', async (button, address, filename) => {
    fetchBlob.mockResolvedValue(new Blob(['x']));
    const user = setup();
    await user.click(screen.getByRole('button', { name: button }));
    expect(await screen.findByText('Your data has been downloaded.')).toBeInTheDocument();
    expect(fetchBlob).toHaveBeenCalledWith(address);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatch(filename);
  });

  it('allows one download at a time, and recovers after a failure', async () => {
    let fail;
    fetchBlob.mockReturnValue(new Promise((_, reject) => (fail = reject)));
    const user = setup();
    const zip = screen.getByRole('button', { name: 'Download with files (.zip)' });
    const json = screen.getByRole('button', { name: 'Data only (.json)' });
    await user.click(zip);
    expect(zip).toBeDisabled();
    expect(json).toBeDisabled();
    fail(new Error('Too many attempts. Please wait a moment and try again.'));
    expect(await screen.findByText(/Too many attempts/)).toBeInTheDocument();
    await waitFor(() => expect(zip).toBeEnabled());
    expect(json).toBeEnabled();
    expect(saved).toHaveLength(0);
  });
});
