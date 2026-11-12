import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import AuthLayout from './AuthLayout.jsx';
import Button from '../../components/ui/Button.jsx';
import Alert from '../../components/ui/Alert.jsx';
import { TextField } from '../../components/ui/Field.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useForm } from '../../hooks/useForm.js';

export default function LoginPage() {
  const { login, sessionNotice, clearSessionNotice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { bind, handleSubmit, submitting, formError } = useForm(
    { email: '', password: '' },
    {
      validate: (v) => ({
        email: !v.email.trim() ? 'Enter your email' : undefined,
        password: !v.password ? 'Enter your password' : undefined,
      }),
    }
  );

  const onSubmit = handleSubmit(async (values) => {
    const user = await login(values);
    clearSessionNotice();
    const from = location.state?.from;
    navigate(user.onboardingCompleted ? from || '/' : '/onboarding', { replace: true });
  });

  return (
    <AuthLayout>
      <p className="mm-eyebrow mb-2">Welcome back</p>
      <h2 className="mm-display text-4xl text-ink library:text-[2.6rem]">
        Sign in to <em>Mindmesh</em>
      </h2>
      <p className="mt-2 font-ui text-sm text-ink-muted">Pick up where you left off.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
        {sessionNotice && <Alert tone="info">{sessionNotice}</Alert>}
        {formError && <Alert tone="error">{formError}</Alert>}
        <TextField label="Email" type="email" autoComplete="email" autoFocus placeholder="you@example.com" {...bind('email')} />
        <TextField label="Password" type="password" autoComplete="current-password" {...bind('password')} />
        <Button type="submit" size="lg" className="w-full" loading={submitting} iconRight={ArrowRight}>
          Sign in
        </Button>
      </form>

      <p className="mt-8 text-center font-ui text-sm text-ink-muted">
        New to Mindmesh?{' '}
        <Link to="/register" className="font-semibold text-accent underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
