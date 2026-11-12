import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import AuthLayout from './AuthLayout.jsx';
import Button from '../../components/ui/Button.jsx';
import Alert from '../../components/ui/Alert.jsx';
import { TextField } from '../../components/ui/Field.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { useForm } from '../../hooks/useForm.js';

function validate(v) {
  return {
    name: !v.name.trim() ? 'Tell us your name' : undefined,
    email: !/^\S+@\S+\.\S+$/.test(v.email.trim()) ? 'Enter a valid email address' : undefined,
    password:
      v.password.length < 8
        ? 'Use at least 8 characters'
        : !(/[A-Za-z]/.test(v.password) && /\d/.test(v.password))
          ? 'Include at least one letter and one number'
          : undefined,
  };
}

export default function RegisterPage() {
  const { register } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const { bind, handleSubmit, submitting, formError } = useForm({ name: '', email: '', password: '' }, { validate });

  const onSubmit = handleSubmit(async (values) => {
    // Carry the theme the visitor previewed into their new account.
    await register({ ...values, theme });
    navigate('/onboarding', { replace: true });
  });

  return (
    <AuthLayout>
      <p className="mm-eyebrow mb-2">Create your workspace</p>
      <h2 className="mm-display text-4xl text-ink library:text-[2.6rem]">
        Start your <em>mesh</em>
      </h2>
      <p className="mt-2 font-ui text-sm text-ink-muted">It takes less than a minute. You can change everything later.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
        {formError && <Alert tone="error">{formError}</Alert>}
        <TextField label="Your name" autoComplete="name" autoFocus placeholder="Ada Lovelace" {...bind('name')} />
        <TextField label="Email" type="email" autoComplete="email" placeholder="you@example.com" {...bind('email')} />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters, with a letter and a number."
          {...bind('password')}
        />
        <Button type="submit" size="lg" className="w-full" loading={submitting} iconRight={ArrowRight}>
          Create account
        </Button>
      </form>

      <p className="mt-8 text-center font-ui text-sm text-ink-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-accent underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
