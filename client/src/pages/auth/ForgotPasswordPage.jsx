import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import AuthLayout from './AuthLayout.jsx';
import Button from '../../components/ui/Button.jsx';
import Alert from '../../components/ui/Alert.jsx';
import { TextField } from '../../components/ui/Field.jsx';
import { authApi } from '../../api/endpoints.js';
import { useForm } from '../../hooks/useForm.js';

const linkClass = 'font-semibold text-accent underline-offset-4 hover:underline';

export default function ForgotPasswordPage() {
  const location = useLocation();
  const [sent, setSent] = useState(null);
  const { bind, handleSubmit, submitting, formError } = useForm(
    { email: location.state?.email || '' },
    { validate: (v) => ({ email: !/^\S+@\S+\.\S+$/.test(v.email.trim()) ? 'Enter a valid email address' : undefined }) }
  );

  const onSubmit = handleSubmit(async ({ email }) => {
    const result = await authApi.forgotPassword({ email: email.trim() });
    setSent({ ...result, email: email.trim() });
  });

  return (
    <AuthLayout>
      <p className="mm-eyebrow mb-2">Account recovery</p>
      <h2 className="mm-display text-4xl text-ink library:text-[2.6rem]">
        {sent ? (
          <>
            Check your <em>{sent.delivery === 'console' ? 'server window' : 'email'}</em>
          </>
        ) : (
          <>
            Forgot your <em>password</em>?
          </>
        )}
      </h2>

      {sent ? (
        <div className="mt-6 space-y-4">
          <Alert tone="info">
            <p>
              {sent.delivery === 'console'
                ? `Email isn’t set up here, so nothing was sent. If an account exists for ${sent.email}, its reset link has been printed in the window where the server is running.`
                : `If an account exists for ${sent.email}, we’ve sent it a link to choose a new password.`}
            </p>
            <p className="mt-2">
              The link works once and expires in {sent.expiresInMinutes} minutes.
              {sent.delivery !== 'console' && ' Nothing after a few minutes? Check your spam folder, then try again.'}
            </p>
          </Alert>
          <Button variant="secondary" className="w-full" onClick={() => setSent(null)}>
            Try again or use another email
          </Button>
        </div>
      ) : (
        <>
          <p className="mt-2 font-ui text-sm text-ink-muted">Enter your account’s email and we’ll send you a link to choose a new one.</p>
          <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
            {formError && <Alert tone="error">{formError}</Alert>}
            <TextField label="Email" type="email" autoComplete="email" autoFocus placeholder="you@example.com" {...bind('email')} />
            <Button type="submit" size="lg" className="w-full" loading={submitting} iconRight={ArrowRight}>
              Send reset link
            </Button>
          </form>
        </>
      )}

      <p className="mt-8 text-center font-ui text-sm text-ink-muted">
        Remembered it?{' '}
        <Link to="/login" className={linkClass}>
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
