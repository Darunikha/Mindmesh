import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2 } from 'lucide-react';
import Dialog from '../ui/Dialog.jsx';
import Button from '../ui/Button.jsx';
import Alert from '../ui/Alert.jsx';
import { TextField } from '../ui/Field.jsx';
import CollectionSelect from './CollectionSelect.jsx';
import TagPicker from './TagPicker.jsx';
import { libraryApi } from '../../api/library.js';
import { useLibrary } from '../../context/LibraryContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';

export default function LinkDialog({ open, onClose, defaultCollectionId, onSaved }) {
  const { refreshTags, refreshCollections } = useLibrary();
  const toast = useToast();
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [collectionId, setCollectionId] = useState(defaultCollectionId || null);
  const [tags, setTags] = useState([]);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setUrl('');
      setTitle('');
      setTags([]);
      setErrors({});
      setError(null);
      setCollectionId(defaultCollectionId || null);
    }
  }, [open, defaultCollectionId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!url.trim()) {
      setErrors({ url: 'Paste a link' });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { resource } = await libraryApi.createLink({ url: url.trim(), title: title.trim() || undefined, collectionId, tags });
      refreshTags();
      refreshCollections();
      onSaved?.(resource);
      toast.success('Link saved. Fetching the page in the background.');
      onClose();
      navigate(`/vault/${resource.id}`);
    } catch (err) {
      setErrors(err.fields || {});
      if (!Object.keys(err.fields || {}).length) setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Save a link" description="Mindmesh fetches the page title, description and readable text where the site allows it.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <TextField label="URL" type="url" inputMode="url" placeholder="https://example.com/article" value={url} error={errors.url} autoFocus onChange={(e) => setUrl(e.target.value)} />
        <TextField label="Title" optional placeholder="Use the page's title" value={title} maxLength={300} error={errors.title} onChange={(e) => setTitle(e.target.value)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <CollectionSelect value={collectionId} onChange={setCollectionId} />
          <TagPicker value={tags} onChange={setTags} compact />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" icon={Link2} loading={saving}>
            Save link
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
