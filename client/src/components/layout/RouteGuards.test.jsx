import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext.jsx';
import { ThemeContext } from '../../context/ThemeContext.jsx';
import { BootScreen, PublicOnly, RequireAuth, ServerUnreachable } from './RouteGuards.jsx';

const theme = { theme: 'studio', setTheme: () => {} };
const withTheme = (ui) => <ThemeContext.Provider value={theme}>{ui}</ThemeContext.Provider>;

afterEach(() => {
  cleanup();
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
});

const user = (extra = {}) => ({ id: 'u1', name: 'Ada', onboardingCompleted: true, ...extra });

function Where() {
  const l = useLocation();
  return (
    <p data-testid="where">
      {l.pathname}
      {l.state?.from ? ` (from ${l.state.from})` : ''}
    </p>
  );
}

function renderAt(path, auth) {
  return render(
    withTheme(
      <AuthContext.Provider value={{ retryRestore: vi.fn(), ...auth }}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<RequireAuth />}>
              <Route path="/" element={<p>Home page</p>} />
              <Route path="/vault" element={<p>Vault page</p>} />
            </Route>
            <Route element={<RequireAuth allowIncompleteOnboarding />}>
              <Route path="/onboarding" element={<p>Onboarding page</p>} />
            </Route>
            <Route element={<PublicOnly />}>
              <Route path="/login" element={<p>Login page</p>} />
            </Route>
          </Routes>
          <Where />
        </MemoryRouter>
      </AuthContext.Provider>
    )
  );
}

describe('RequireAuth', () => {
  it('shows the app to a signed-in, onboarded user', () => {
    renderAt('/vault', { status: 'authenticated', user: user() });
    expect(screen.getByText('Vault page')).toBeInTheDocument();
  });

  it('sends a signed-out visitor to the sign-in page and remembers where they were going', () => {
    renderAt('/vault', { status: 'anonymous', user: null });
    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/login (from /vault)');
  });

  it('sends a new user who has not finished onboarding to onboarding first', () => {
    renderAt('/', { status: 'authenticated', user: user({ onboardingCompleted: false }) });
    expect(screen.getByText('Onboarding page')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/onboarding');
  });

  it('lets the onboarding page itself through for an un-onboarded user (no redirect loop)', () => {
    renderAt('/onboarding', { status: 'authenticated', user: user({ onboardingCompleted: false }) });
    expect(screen.getByText('Onboarding page')).toBeInTheDocument();
  });

  it('shows a loading screen, not the app or the sign-in page, while the session is being restored', () => {
    renderAt('/vault', { status: 'loading', user: null });
    expect(screen.getByRole('status', { name: 'Restoring your session' })).toBeInTheDocument();
    expect(screen.queryByText('Vault page')).toBeNull();
    expect(screen.queryByText('Login page')).toBeNull();
    expect(screen.getByTestId('where').textContent).toBe('/vault');
  });

  it('shows the "can’t reach Mindmesh" screen instead of bouncing to sign-in when the server is down', () => {
    renderAt('/vault', { status: 'unreachable', user: null });
    expect(screen.getByRole('alert')).toHaveTextContent(/can’t reach/i);
    expect(screen.getByTestId('where').textContent).toBe('/vault');
    expect(screen.queryByText('Login page')).toBeNull();
  });
});

describe('PublicOnly', () => {
  it('shows the sign-in page to signed-out visitors', () => {
    renderAt('/login', { status: 'anonymous', user: null });
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it('sends a signed-in user home', () => {
    renderAt('/login', { status: 'authenticated', user: user() });
    expect(screen.getByText('Home page')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/');
  });

  it('sends a signed-in user who has not onboarded to onboarding', () => {
    renderAt('/login', { status: 'authenticated', user: user({ onboardingCompleted: false }) });
    expect(screen.getByText('Onboarding page')).toBeInTheDocument();
  });

  it('waits while loading, and shows the unreachable screen when the server is down', () => {
    const { unmount } = renderAt('/login', { status: 'loading', user: null });
    expect(screen.getByRole('status', { name: 'Restoring your session' })).toBeInTheDocument();
    expect(screen.queryByText('Login page')).toBeNull();
    unmount();
    renderAt('/login', { status: 'unreachable', user: null });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Login page')).toBeNull();
  });
});

describe('ServerUnreachable', () => {
  const show = (retryRestore = vi.fn()) =>
    render(
      withTheme(
        <AuthContext.Provider value={{ retryRestore }}>
          <ServerUnreachable />
        </AuthContext.Provider>
      )
    );

  it('reassures the user and offers to try again', () => {
    const retryRestore = vi.fn();
    show(retryRestore);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/can’t reach Mindmesh right now/);
    expect(screen.getByText(/you’re still signed in/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again now/i }));
    expect(retryRestore).toHaveBeenCalledTimes(1);
  });

  it('says "offline" when the browser is offline, and switches back when it reconnects', () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    show();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/offline/i);
    expect(screen.getByText(/when you’re back online/)).toBeInTheDocument();
    act(() => void window.dispatchEvent(new Event('online')));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/can’t reach Mindmesh/);
  });
});

describe('BootScreen', () => {
  it('announces that the session is being restored', () => {
    render(withTheme(<BootScreen />));
    expect(screen.getByRole('status', { name: 'Restoring your session' })).toBeInTheDocument();
  });
});
