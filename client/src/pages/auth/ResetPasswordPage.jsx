import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import AuthLayout from './AuthLayout.jsx';
import Button from '../../components/ui/Button.jsx';
import Alert from '../../components/ui/Alert.jsx';
import { TextField } from '../../components/ui/Field.jsx';
import { authApi } from '../../api/endpoints.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useForm } from '../../hooks/useForm.js';

const linkClass = 'font-semibold text-accent underline-offset-4 hover:underline';

function validate(v) {
  return {
    password:
      v.password.length < 8
        ? 'Use at least 8 characters'
        : !(/[A-Za-z]/.test(v.password) && /\d/.test(v.password))
          ? 'Include at least one letter and one number'
          : undefined,
    confirmPassword: v.confirmPassword !== v.password ? 'Passwords do not match' : undefined,
  };
}

/** Opened from the emailed link: /reset-password#token=… */
export default function ResetPasswordPage() {
  const { hash } = useLocation();
  const token = new URLSearchParams(hash.slice(1)).get('token');
  const { signOutLocally } = useAuth();
  // The token the result belongs to, so opening a newer link in the same tab starts afresh.
  const [result, setResult] = useState(null);
  const { bind, handleSubmit, submitting, formError, reset } = useForm({ password: '', confirmPassword: '' }, { validate });

  const state = !token ? 'incomplete' : result?.token === token ? result.state : 'form';

  const onSubmit = handleSubmit(async ({ password }) => {
    try {
      await authApi.resetPassword({ token, password });
    } catch (err) {
      if (err.code !== 'RESET_LINK_INVALID') throw err;
      setResult({ token, state: 'invalid' });
      return;
    }
    // The server has ended every session, including one open in this browser.
    signOutLocally();
    reset();
    setResult({ token, state: 'done' });
  });

  return (
    <AuthLayout>
      <p className="mm-eyebrow mb-2">Account recovery</p>
      <h2 className="mm-display text-4xl text-ink library:text-[2.6rem]">
        {state === 'done' ? (
          <>
            Password <em>changed</em>
          </>
        ) : (
          <>
            Choose a new <em>password</em>
          </>
        )}
      </h2>

      {state === 'form' && (
        <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
          {formError && <Alert tone="error">{formError}</Alert>}
          <TextField label="New password" type="password" autoComplete="new-password" autoFocus hint="At least 8 characters, with a letter and a number." {...bind('password')} />
          <TextField label="Confirm new password" type="password" autoComplete="new-password" {...bind('confirmPassword')} />
          <Button type="submit" size="lg" className="w-full" loading={submitting} iconRight={ArrowRight}>
            Save new password
          </Button>
        </form>
      )}

      {state === 'done' && (
        <div className="mt-6 space-y-4">
          <Alert tone="success">Your new password is saved, and every device has been signed out.</Alert>
          <p className="text-center font-ui text-sm">
            <Link to="/login" className={linkClass}>
              Sign in with your new password
            </Link>
          </p>
        </div>
      )}

      {(state === 'invalid' || state === 'incomplete') && (
        <div className="mt-6 space-y-4">
          <Alert tone="error">
            {state === 'invalid'
              ? 'This reset link has expired or has already been used.'
              : 'This reset link is incomplete. Open it again from the email, or copy the whole address.'}
          </Alert>
          <p className="text-center font-ui text-sm">
            <Link to="/forgot-password" className={linkClass}>
              Request a new link
            </Link>
          </p>
        </div>
      )}

      {state !== 'done' && (
        <p className="mt-8 text-center font-ui text-sm text-ink-muted">
          <Link to="/login" className={linkClass}>
            Back to sign in
          </Link>
        </p>
      )}
    </AuthLayout>
  );
}
