import { useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Alert from '../../components/ui/Alert.jsx';
import { TextArea, TextField } from '../../components/ui/Field.jsx';
import InterestPicker from '../../components/theme/InterestPicker.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { usersApi } from '../../api/endpoints.js';

export default function ProfileSection() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio || '');
  const [interests, setInterests] = useState(user.interests || []);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(
    () => name !== user.name || bio !== (user.bio || '') || JSON.stringify(interests) !== JSON.stringify(user.interests || []),
    [name, bio, interests, user]
  );

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setErrors({ name: 'Name cannot be empty' });
      return;
    }
    setSaving(true);
    try {
      const { user: updated } = await usersApi.updateProfile({ name: name.trim(), bio: bio.trim(), interests });
      setUser(updated);
      setInterests(updated.interests);
      toast.success('Profile updated');
    } catch (err) {
      setErrors(err.fields || {});
      if (!Object.keys(err.fields || {}).length) setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card className="p-5 sm:p-6">
        <CardHeader eyebrow="About you" title="Profile" />
        <div className="mt-5 space-y-5">
          {error && <Alert tone="error">{error}</Alert>}
          <TextField
            label="Name"
            value={name}
            maxLength={80}
            error={errors.name}
            onChange={(e) => {
              setName(e.target.value);
              setErrors((s) => ({ ...s, name: undefined }));
            }}
          />
          <TextArea
            label="Bio"
            optional
            value={bio}
            maxLength={280}
            rows={3}
            error={errors.bio}
            hint={`${bio.length}/280. A short line about what you study or work on.`}
            onChange={(e) => setBio(e.target.value)}
          />
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <CardHeader eyebrow="Interests" title="Topics you care about" />
        <p className="mt-1 mb-5 font-ui text-sm text-ink-muted">Used for home-page suggestions and as starting topics in your knowledge graph.</p>
        <InterestPicker value={interests} onChange={setInterests} />
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          disabled={!dirty || saving}
          onClick={() => {
            setName(user.name);
            setBio(user.bio || '');
            setInterests(user.interests || []);
            setErrors({});
          }}
        >
          Discard
        </Button>
        <Button type="submit" icon={Save} loading={saving} disabled={!dirty}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
