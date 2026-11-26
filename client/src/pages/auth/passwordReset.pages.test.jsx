import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import LoginPage from './LoginPage.jsx';
import ForgotPasswordPage from './ForgotPasswordPage.jsx';
import ResetPasswordPage from './ResetPasswordPage.jsx';
import { AuthContext } from '../../context/AuthContext.jsx';
import { ThemeContext } from '../../context/ThemeContext.jsx';
import { ApiRequestError } from '../../api/client.js';

const forgotPassword = vi.fn();
const resetPassword = vi.fn();
vi.mock('../../api/endpoints.js', () => ({
  authApi: { forgotPassword: (...a) => forgotPassword(...a), resetPassword: (...a) => resetPassword(...a) },
}));

afterEach(() => {
  cleanup();
  forgotPassword.mockReset();
  resetPassword.mockReset();
});

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function setup(path) {
  const auth = { login: vi.fn(), sessionNotice: null, clearSessionNotice: vi.fn(), signOutLocally: vi.fn() };
  render(
    <ThemeContext.Provider value={{ theme: 'studio', setTheme: () => {} }}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
          </Routes>
          <Where />
        </MemoryRouter>
      </AuthContext.Provider>
    </ThemeContext.Provider>
  );
  return { auth, user: userEvent.setup() };
}

const where = () => screen.getByTestId('where').textContent;

describe('forgot password', () => {
  it('is linked from sign-in and keeps the email already typed', async () => {
    const { user } = setup('/login');
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.click(screen.getByRole('link', { name: 'Forgot password?' }));
    expect(where()).toBe('/forgot-password');
    expect(screen.getByLabelText('Email')).toHaveValue('ada@example.com');
  });

  it('checks the address before calling the server', async () => {
    const { user } = setup('/forgot-password');
    await user.type(screen.getByLabelText('Email'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(forgotPassword).not.toHaveBeenCalled();
  });

  it('confirms without saying whether the account exists, and lets you try again', async () => {
    forgotPassword.mockResolvedValue({ delivery: 'smtp', expiresInMinutes: 30 });
    const { user } = setup('/forgot-password');
    await user.type(screen.getByLabelText('Email'), '  ada@example.com ');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('status')).toHaveTextContent('If an account exists for ada@example.com, we’ve sent it a link');
    expect(screen.getByRole('status')).toHaveTextContent('expires in 30 minutes');
    expect(forgotPassword).toHaveBeenCalledWith({ email: 'ada@example.com' });
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('is honest when email is not set up on a development server', async () => {
    forgotPassword.mockResolvedValue({ delivery: 'console', expiresInMinutes: 30 });
    const { user } = setup('/forgot-password');
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('status')).toHaveTextContent('nothing was sent');
    expect(screen.getByRole('status')).not.toHaveTextContent('spam folder');
  });

  it('shows the server’s explanation when it cannot send email', async () => {
    forgotPassword.mockRejectedValue(new ApiRequestError(503, 'Password reset by email isn’t set up on this server.', 'EMAIL_NOT_CONFIGURED'));
    const { user } = setup('/forgot-password');
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('isn’t set up on this server');
  });
});

describe('reset password', () => {
  const fill = async (user, password, again = password) => {
    await user.type(screen.getByLabelText('New password'), password);
    await user.type(screen.getByLabelText('Confirm new password'), again);
    await user.click(screen.getByRole('button', { name: 'Save new password' }));
  };

  it('saves the new password with the token from the link, then signs this browser out', async () => {
    resetPassword.mockResolvedValue(null);
    const { user, auth } = setup('/reset-password#token=abc123');
    await fill(user, 'difference2');
    expect(await screen.findByRole('status')).toHaveTextContent('Your new password is saved');
    expect(resetPassword).toHaveBeenCalledWith({ token: 'abc123', password: 'difference2' });
    expect(auth.signOutLocally).toHaveBeenCalled();
    await user.click(screen.getByRole('link', { name: 'Sign in with your new password' }));
    expect(where()).toBe('/login');
  });

  it('refuses weak or mismatched passwords without calling the server', async () => {
    const { user } = setup('/reset-password#token=abc123');
    await fill(user, 'short', 'other');
    expect(await screen.findByText('Use at least 8 characters')).toBeInTheDocument();
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('offers a new link when this one is used or expired', async () => {
    resetPassword.mockRejectedValue(new ApiRequestError(400, 'expired', 'RESET_LINK_INVALID'));
    const { user, auth } = setup('/reset-password#token=old');
    await fill(user, 'difference2');
    expect(await screen.findByRole('alert')).toHaveTextContent('expired or has already been used');
    expect(auth.signOutLocally).not.toHaveBeenCalled();
    await user.click(screen.getByRole('link', { name: 'Request a new link' }));
    expect(where()).toBe('/forgot-password');
  });

  it('keeps the form after other errors so you can retry', async () => {
    resetPassword.mockRejectedValue(new ApiRequestError(429, 'Too many attempts. Please wait a moment and try again.', 'RATE_LIMITED'));
    const { user } = setup('/reset-password#token=abc123');
    await fill(user, 'difference2');
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts');
    expect(screen.getByLabelText('New password')).toHaveValue('difference2');
  });

  it('explains a link with no token', () => {
    setup('/reset-password');
    expect(screen.getByRole('alert')).toHaveTextContent('incomplete');
    expect(screen.queryByLabelText('New password')).toBeNull();
  });
});
