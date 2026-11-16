import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import Logo from '../theme/Logo.jsx';
import Spinner from '../ui/Spinner.jsx';
import Button from '../ui/Button.jsx';
import { useOnline } from '../../hooks/useOnline.js';
import { RefreshCw } from 'lucide-react';

export function BootScreen() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5">
      <div className="mm-backdrop" aria-hidden />
      <div className="relative flex flex-col items-center gap-5">
        <Logo size={40} />
        <Spinner size={20} className="text-accent" label="Restoring your session" />
      </div>
    </div>
  );
}

/** Shown when the server can't be contacted at start-up (offline, or the server is down). */
export function ServerUnreachable() {
  const { retryRestore } = useAuth();
  const online = useOnline();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <div className="mm-backdrop" aria-hidden />
      <div className="relative max-w-md" role="alert">
        <Logo size={40} />
        <h1 className="mm-display mt-6 text-3xl text-ink sm:text-4xl">{online ? <>We can’t reach <em>Mindmesh</em> right now</> : <>You’re <em>offline</em></>}</h1>
        <p className="mt-3 font-ui text-ink-muted">
          {online ? 'The server isn’t responding. Your notes are safe, and you’re still signed in.' : 'Your notes are safe, and you’re still signed in. Reconnect to the internet to continue.'} We’ll try again automatically{online ? '' : ' when you’re back online'}.
        </p>
        <Button className="mt-6" icon={RefreshCw} onClick={retryRestore}>
          Try again now
        </Button>
      </div>
    </div>
  );
}

/** Signed-in users only. Sends users who haven't onboarded to onboarding first. */
export function RequireAuth({ allowIncompleteOnboarding = false }) {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <BootScreen />;
  if (status === 'unreachable') return <ServerUnreachable />;
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!allowIncompleteOnboarding && !user.onboardingCompleted) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

/** Login / register: bounce authenticated users into the app. */
export function PublicOnly() {
  const { status, user } = useAuth();
  if (status === 'loading') return <BootScreen />;
  if (status === 'unreachable') return <ServerUnreachable />;
  if (status === 'authenticated') return <Navigate to={user.onboardingCompleted ? '/' : '/onboarding'} replace />;
  return <Outlet />;
}
