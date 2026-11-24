import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import LoginPage from './LoginPage.jsx';
import RegisterPage from './RegisterPage.jsx';
import { AuthContext } from '../../context/AuthContext.jsx';
import { ThemeContext } from '../../context/ThemeContext.jsx';
import { ApiRequestError } from '../../api/client.js';

afterEach(cleanup);

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname}</p>;
}

function setup(ui, { auth = {}, path = '/login', state, theme = 'studio' } = {}) {
  const setTheme = vi.fn();
  const authValue = { login: vi.fn(), register: vi.fn(), sessionNotice: null, clearSessionNotice: vi.fn(), ...auth };
  const utils = render(
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <AuthContext.Provider value={authValue}>
        <MemoryRouter initialEntries={[{ pathname: path, state }]}>
          <Routes>
            <Route path="/login" element={ui} />
            <Route path="/register" element={ui} />
            <Route path="*" element={<p>Somewhere else</p>} />
          </Routes>
          <Where />
        </MemoryRouter>
      </AuthContext.Provider>
    </ThemeContext.Provider>
  );
  return { ...utils, auth: authValue, setTheme, user: userEvent.setup() };
}

describe('LoginPage', () => {
  it('asks for both fields when submitted empty, and does not call the server', async () => {
    const { user, auth } = setup(<LoginPage />);
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Enter your email')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('an error disappears as soon as you start fixing that field', async () => {
    const { user } = setup(<LoginPage />);
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await screen.findByText('Enter your email');
    await user.type(screen.getByLabelText('Email'), 'a');
    expect(screen.queryByText('Enter your email')).toBeNull();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
  });

  it('signs in and goes home', async () => {
    const login = vi.fn().mockResolvedValue({ onboardingCompleted: true });
    const { user, auth } = setup(<LoginPage />, { auth: { login } });
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'secret123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText('Somewhere else')).toBeInTheDocument());
    expect(login).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'secret123' });
    expect(screen.getByTestId('where')).toHaveTextContent('/');
    expect(auth.clearSessionNotice).toHaveBeenCalled();
  });

  it('can be submitted with the Enter key', async () => {
    const login = vi.fn().mockResolvedValue({ onboardingCompleted: true });
    const { user } = setup(<LoginPage />, { auth: { login } });
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'secret123{Enter}');
    await waitFor(() => expect(login).toHaveBeenCalledTimes(1));
  });

  it('returns you to the page you were trying to open', async () => {
    const login = vi.fn().mockResolvedValue({ onboardingCompleted: true });
    const { user } = setup(<LoginPage />, { auth: { login }, state: { from: '/vault' } });
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'pw');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/vault'));
  });

  it('sends a user who has not finished onboarding to onboarding, ignoring the old destination', async () => {
    const login = vi.fn().mockResolvedValue({ onboardingCompleted: false });
    const { user } = setup(<LoginPage />, { auth: { login }, state: { from: '/vault' } });
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'pw');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/onboarding'));
  });

  it('shows the server’s message when the sign-in fails, and stays on the page', async () => {
    const login = vi.fn().mockRejectedValue(new ApiRequestError(401, 'Incorrect email or password', 'INVALID_CREDENTIALS'));
    const { user } = setup(<LoginPage />, { auth: { login } });
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password');
    expect(screen.getByTestId('where')).toHaveTextContent('/login');
  });

  it('shows a friendly message when the server can’t be reached', async () => {
    const login = vi.fn().mockRejectedValue(new ApiRequestError(0, 'Could not reach the Mindmesh server. Check your connection and try again.', 'NETWORK'));
    const { user } = setup(<LoginPage />, { auth: { login } });
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'pw');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach/i);
  });

  it('explains why you were signed out, when there is a reason', () => {
    setup(<LoginPage />, { auth: { sessionNotice: 'Your session was ended for security reasons' } });
    expect(screen.getByRole('status')).toHaveTextContent('Your session was ended for security reasons');
  });

  it('shows no notice when there is no reason, and links to sign-up', () => {
    setup(<LoginPage />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('link', { name: /create an account/i })).toHaveAttribute('href', '/register');
  });
});

describe('RegisterPage', () => {
  const fill = async (user, { name = 'Ada Lovelace', email = 'ada@example.com', password = 'secret123' } = {}) => {
    if (name) await user.type(screen.getByLabelText('Your name'), name);
    if (email) await user.type(screen.getByLabelText('Email'), email);
    if (password) await user.type(screen.getByLabelText('Password'), password);
    await user.click(screen.getByRole('button', { name: /create account/i }));
  };

  it('asks for a name, a valid email and a password', async () => {
    const { user, auth } = setup(<RegisterPage />, { path: '/register' });
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText('Tell us your name')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Use at least 8 characters')).toBeInTheDocument();
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only names and malformed emails', async () => {
    const { user, auth } = setup(<RegisterPage />, { path: '/register' });
    await fill(user, { name: '   ', email: 'not-an-email' });
    expect(await screen.findByText('Tell us your name')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(auth.register).not.toHaveBeenCalled();
  });

  it.each([
    ['short', 'abc1', 'Use at least 8 characters'],
    ['letters only', 'abcdefghij', 'Include at least one letter and one number'],
    ['numbers only', '1234567890', 'Include at least one letter and one number'],
  ])('rejects a password that is %s', async (_label, password, message) => {
    const { user, auth } = setup(<RegisterPage />, { path: '/register' });
    await fill(user, { password });
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('shows the password rule as a hint before anything goes wrong', () => {
    setup(<RegisterPage />, { path: '/register' });
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('At least 8 characters, with a letter and a number.');
  });

  it('creates the account with the theme the visitor was previewing, then starts onboarding', async () => {
    const register = vi.fn().mockResolvedValue({ onboardingCompleted: false });
    const { user } = setup(<RegisterPage />, { path: '/register', auth: { register }, theme: 'lab' });
    await fill(user);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/onboarding'));
    expect(register).toHaveBeenCalledWith({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'secret123', theme: 'lab' });
  });

  it('puts “email already used” next to the email field', async () => {
    const register = vi.fn().mockRejectedValue(new ApiRequestError(409, 'Could not create account', 'EMAIL_TAKEN', { fields: { email: 'An account with this email already exists' } }));
    const { user } = setup(<RegisterPage />, { path: '/register', auth: { register } });
    await fill(user);
    expect(await screen.findByText('An account with this email already exists')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('where')).toHaveTextContent('/register');
  });

  it('shows other failures as a message above the form', async () => {
    const register = vi.fn().mockRejectedValue(new ApiRequestError(429, 'Too many attempts. Please wait a moment and try again.', 'RATE_LIMITED'));
    const { user } = setup(<RegisterPage />, { path: '/register', auth: { register } });
    await fill(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts');
  });

  it('links to sign-in for people who already have an account', () => {
    setup(<RegisterPage />, { path: '/register' });
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
  });
});
