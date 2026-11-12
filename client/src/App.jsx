import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { LibraryProvider } from './context/LibraryContext.jsx';
import { PublicOnly, RequireAuth } from './components/layout/RouteGuards.jsx';
import AppShell from './components/layout/AppShell.jsx';
import LoginPage from './pages/auth/LoginPage.jsx';
import RegisterPage from './pages/auth/RegisterPage.jsx';
import OnboardingPage from './pages/OnboardingPage.jsx';
import HomePage from './pages/HomePage.jsx';
import SettingsPage from './pages/settings/SettingsPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import Skeleton from './components/ui/Skeleton.jsx';

// Library pages (and the rich-text editor) load on demand to keep the first load small.
const VaultPage = lazy(() => import('./pages/vault/VaultPage.jsx'));
const ResourcePage = lazy(() => import('./pages/vault/ResourcePage.jsx'));
const CollectionsPage = lazy(() => import('./pages/CollectionsPage.jsx'));

const page = (el) => (
  <Suspense
    fallback={
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-64" />
      </div>
    }
  >
    {el}
  </Suspense>
);

export default function App() {
  return (
    <Routes>
      <Route element={<PublicOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<RequireAuth allowIncompleteOnboarding />}>
        <Route path="/onboarding" element={<OnboardingGate />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route
          element={
            <LibraryProvider>
              <AppShell />
            </LibraryProvider>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="/settings" element={<Navigate to="/settings/profile" replace />} />
          <Route path="/settings/:tab" element={<SettingsPage />} />
          <Route path="/vault" element={page(<VaultPage />)} />
          <Route path="/vault/:id" element={page(<ResourcePage />)} />
          <Route path="/collections" element={page(<CollectionsPage />)} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

/** Users who have already onboarded go straight to the app. */
function OnboardingGate() {
  const { user } = useAuth();
  if (user?.onboardingCompleted) return <Navigate to="/" replace />;
  return <OnboardingPage />;
}
