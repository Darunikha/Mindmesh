import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { LibraryProvider } from './context/LibraryContext.jsx';
import { StudyProvider } from './context/StudyContext.jsx';
import { PublicOnly, RequireAuth } from './components/layout/RouteGuards.jsx';
import AppShell from './components/layout/AppShell.jsx';
import LoginPage from './pages/auth/LoginPage.jsx';
import RegisterPage from './pages/auth/RegisterPage.jsx';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage.jsx';
import ResetPasswordPage from './pages/auth/ResetPasswordPage.jsx';
import OnboardingPage from './pages/OnboardingPage.jsx';
import HomePage from './pages/HomePage.jsx';
import SettingsPage from './pages/settings/SettingsPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import Skeleton from './components/ui/Skeleton.jsx';
import TitleManager from './components/layout/TitleManager.jsx';
import OfflineBanner from './components/layout/OfflineBanner.jsx';

// Library pages (and the rich-text editor) load on demand to keep the first load small.
const VaultPage = lazy(() => import('./pages/vault/VaultPage.jsx'));
const ResourcePage = lazy(() => import('./pages/vault/ResourcePage.jsx'));
const CollectionsPage = lazy(() => import('./pages/CollectionsPage.jsx'));
const AssistantPage = lazy(() => import('./pages/assistant/AssistantPage.jsx'));
const SearchPage = lazy(() => import('./pages/SearchPage.jsx'));
const GraphPage = lazy(() => import('./pages/graph/GraphPage.jsx'));
const TimelinePage = lazy(() => import('./pages/TimelinePage.jsx'));
const FlashcardsPage = lazy(() => import('./pages/FlashcardsPage.jsx'));
const QuizPage = lazy(() => import('./pages/QuizPage.jsx'));

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
    <>
      <TitleManager />
      <OfflineBanner />
      <Routes>
        <Route element={<PublicOnly />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Route>

        {/* Outside the guards: an emailed link must open even in a browser that is signed in. */}
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        <Route element={<RequireAuth allowIncompleteOnboarding />}>
          <Route path="/onboarding" element={<OnboardingGate />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route
            element={
              <LibraryProvider>
                <StudyProvider>
                  <AppShell />
                </StudyProvider>
              </LibraryProvider>
            }
          >
            <Route index element={<HomePage />} />
            <Route path="/settings" element={<Navigate to="/settings/profile" replace />} />
            <Route path="/settings/:tab" element={<SettingsPage />} />
            <Route path="/vault" element={page(<VaultPage />)} />
            <Route path="/vault/:id" element={page(<ResourcePage />)} />
            <Route path="/collections" element={page(<CollectionsPage />)} />
            <Route path="/assistant/:id?" element={page(<AssistantPage />)} />
            <Route path="/search" element={page(<SearchPage />)} />
            <Route path="/graph" element={page(<GraphPage />)} />
            <Route path="/timeline" element={page(<TimelinePage />)} />
            <Route path="/flashcards" element={page(<FlashcardsPage />)} />
            <Route path="/quiz" element={page(<QuizPage />)} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </>
  );
}

/** Users who have already onboarded go straight to the app. */
function OnboardingGate() {
  const { user } = useAuth();
  if (user?.onboardingCompleted) return <Navigate to="/" replace />;
  return <OnboardingPage />;
}
