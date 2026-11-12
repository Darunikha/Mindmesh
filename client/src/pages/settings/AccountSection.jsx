import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Dialog from '../../components/ui/Dialog.jsx';
import Alert from '../../components/ui/Alert.jsx';
import { TextField } from '../../components/ui/Field.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { usersApi } from '../../api/endpoints.js';
import { formatDate, relativeTime } from '../../lib/format.js';

function Row({ label, children }) {
  return (
    <div className="flex flex-col gap-1 border-b border-line py-3.5 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <dt className="font-ui text-sm text-ink-muted">{label}</dt>
      <dd className="font-ui text-sm text-ink lab:font-mono lab:text-[0.82rem]">{children}</dd>
    </div>
  );
}

export default function AccountSection() {
  const { user, signOutLocally } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const close = () => {
    setOpen(false);
    setPassword('');
    setConfirm('');
    setErrors({});
    setError(null);
  };

  const onDelete = async (e) => {
    e.preventDefault();
    setDeleting(true);
    setError(null);
    try {
      await usersApi.deleteAccount({ password, confirm });
      signOutLocally();
      toast.info('Your account and data have been deleted.');
      navigate('/register', { replace: true });
    } catch (err) {
      setErrors(err.fields || {});
      if (!Object.keys(err.fields || {}).length) setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Card className="p-5 sm:p-6">
        <CardHeader eyebrow="Account" title="Account information" />
        <dl className="mt-3">
          <Row label="Email">{user.email}</Row>
          <Row label="Account ID">
            <span className="font-mono text-xs text-ink-muted">{user.id}</span>
          </Row>
          <Row label="Member since">{formatDate(user.createdAt, { dateStyle: 'long' })}</Row>
          <Row label="Last sign-in">{relativeTime(user.lastLoginAt)}</Row>
          <Row label="Password last changed">{user.passwordChangedAt ? relativeTime(user.passwordChangedAt) : 'Never'}</Row>
        </dl>
      </Card>

      <Card className="border-danger/30 p-5 sm:p-6">
        <CardHeader eyebrow="Danger zone" title="Delete account" />
        <p className="mt-2 max-w-xl font-ui text-sm text-ink-muted">
          Permanently deletes your account, sessions and all saved knowledge. This cannot be undone.
        </p>
        <Button variant="danger-ghost" icon={Trash2} className="mt-4" onClick={() => setOpen(true)}>
          Delete my account
        </Button>
      </Card>

      <Dialog
        open={open}
        onClose={close}
        tone="danger"
        title="Delete your account?"
        description="Everything in your workspace will be permanently removed."
      >
        <form onSubmit={onDelete} className="space-y-4" id="delete-account-form">
          {error && <Alert tone="error">{error}</Alert>}
          <TextField label="Password" type="password" autoComplete="current-password" value={password} error={errors.password} onChange={(e) => setPassword(e.target.value)} />
          <TextField label='Type "DELETE" to confirm' value={confirm} error={errors.confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={deleting} disabled={!password || confirm !== 'DELETE'}>
              Delete permanently
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
