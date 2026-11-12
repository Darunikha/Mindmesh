import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import Logo from '../theme/Logo.jsx';
import Spinner from '../ui/Spinner.jsx';

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

/** Signed-in users only. Sends users who haven't onboarded to onboarding first. */
export function RequireAuth({ allowIncompleteOnboarding = false }) {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <BootScreen />;
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!allowIncompleteOnboarding && !user.onboardingCompleted) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

/** Login / register: bounce authenticated users into the app. */
export function PublicOnly() {
  const { status, user } = useAuth();
  if (status === 'loading') return <BootScreen />;
  if (status === 'authenticated') return <Navigate to={user.onboardingCompleted ? '/' : '/onboarding'} replace />;
  return <Outlet />;
}
