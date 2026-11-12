import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, LogOut, Monitor, Smartphone } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import Dialog from '../../components/ui/Dialog.jsx';
import { TextField } from '../../components/ui/Field.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useForm } from '../../hooks/useForm.js';
import { usersApi } from '../../api/endpoints.js';
import { describeUserAgent, relativeTime } from '../../lib/format.js';

function PasswordCard() {
  const { setUser } = useAuth();
  const toast = useToast();
  const { bind, handleSubmit, submitting, formError, reset } = useForm(
    { currentPassword: '', newPassword: '', confirmPassword: '' },
    {
      validate: (v) => ({
        currentPassword: !v.currentPassword ? 'Enter your current password' : undefined,
        newPassword:
          v.newPassword.length < 8
            ? 'Use at least 8 characters'
            : !(/[A-Za-z]/.test(v.newPassword) && /\d/.test(v.newPassword))
              ? 'Include at least one letter and one number'
              : undefined,
        confirmPassword: v.confirmPassword !== v.newPassword ? 'Passwords do not match' : undefined,
      }),
    }
  );

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    const { user, revokedSessions } = await usersApi.changePassword({ currentPassword, newPassword });
    setUser(user);
    reset();
    toast.success(
      revokedSessions ? `Password changed. Signed out ${revokedSessions} other session${revokedSessions === 1 ? '' : 's'}.` : 'Password changed.'
    );
  });

  return (
    <Card className="p-5 sm:p-6">
      <CardHeader eyebrow="Password" title="Change password" />
      <p className="mt-1 font-ui text-sm text-ink-muted">Changing your password signs you out on every other device.</p>
      <form onSubmit={onSubmit} className="mt-5 grid max-w-xl gap-4" noValidate>
        {formError && <Alert tone="error">{formError}</Alert>}
        <TextField label="Current password" type="password" autoComplete="current-password" {...bind('currentPassword')} />
        <TextField label="New password" type="password" autoComplete="new-password" hint="At least 8 characters, with a letter and a number." {...bind('newPassword')} />
        <TextField label="Confirm new password" type="password" autoComplete="new-password" {...bind('confirmPassword')} />
        <div>
          <Button type="submit" icon={KeyRound} loading={submitting}>
            Update password
          </Button>
        </div>
      </form>
    </Card>
  );
}

function SessionsCard() {
  const { logoutEverywhere } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [signingOutAll, setSigningOutAll] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { sessions: list } = await usersApi.sessions();
      setSessions(list);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (id) => {
    setBusyId(id);
    try {
      await usersApi.revokeSession(id);
      setSessions((s) => s.filter((x) => x.id !== id));
      toast.success('Session signed out');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const signOutAll = async () => {
    setSigningOutAll(true);
    try {
      await logoutEverywhere();
      navigate('/login', { replace: true });
    } catch (err) {
      toast.error(err.message);
      setSigningOutAll(false);
    }
  };

  return (
    <Card className="p-5 sm:p-6">
      <CardHeader
        eyebrow="Sessions"
        title="Where you're signed in"
        action={
          <Button variant="danger-ghost" size="sm" icon={LogOut} onClick={() => setConfirmAll(true)}>
            Sign out everywhere
          </Button>
        }
      />
      <div className="mt-5">
        {error ? (
          <Alert tone="error">
            {error}{' '}
            <button type="button" className="underline" onClick={load}>
              Retry
            </button>
          </Alert>
        ) : !sessions ? (
          <div className="space-y-3">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {sessions.map((s) => {
              const mobile = /Android|iPhone|iPad|Mobile/i.test(s.userAgent);
              const Icon = mobile ? Smartphone : Monitor;
              return (
                <li key={s.id} className="flex items-center gap-3 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-sunken text-ink-muted">
                    <Icon size={17} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-ui text-sm font-semibold text-ink">
                      {describeUserAgent(s.userAgent)}
                      {s.current && <span className="rounded-pill bg-accent-soft px-2 py-px font-ui text-[0.68rem] font-semibold text-accent">This device</span>}
                    </p>
                    <p className="truncate font-ui text-xs text-ink-faint lab:font-mono">
                      {s.ip || 'Unknown IP'} · active {relativeTime(s.lastUsedAt)} · signed in {relativeTime(s.createdAt)}
                    </p>
                  </div>
                  {!s.current && (
                    <Button variant="ghost" size="sm" loading={busyId === s.id} onClick={() => revoke(s.id)}>
                      Sign out
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        title="Sign out everywhere?"
        description="Every session, including this one, will end immediately. You'll need to sign in again."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmAll(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={signingOutAll} onClick={signOutAll}>
              Sign out everywhere
            </Button>
          </>
        }
      />
    </Card>
  );
}

export default function SecuritySection() {
  const { logout } = useAuth();
  return (
    <>
      <PasswordCard />
      <SessionsCard />
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="font-ui font-semibold text-ink">Sign out of this device</p>
          <p className="font-ui text-sm text-ink-muted">Ends this session only.</p>
        </div>
        <Button variant="secondary" icon={LogOut} onClick={logout}>
          Sign out
        </Button>
      </Card>
    </>
  );
}
