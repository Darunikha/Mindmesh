import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Folder, FolderPlus, MoreHorizontal, Pencil, Plus, Tag as TagIcon, Trash2, X } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Dialog from '../components/ui/Dialog.jsx';
import Alert from '../components/ui/Alert.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { TextArea, TextField } from '../components/ui/Field.jsx';
import CollectionSelect from '../components/library/CollectionSelect.jsx';
import { collectionsApi, tagsApi } from '../api/library.js';
import { useLibrary } from '../context/LibraryContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';

/** Create or edit a collection (name, description, parent). */
function CollectionDialog({ open, onClose, editing, defaultParentId }) {
  const { refreshCollections, flatCollections } = useLibrary();
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState(null);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [seededFor, setSeededFor] = useState(null);

  // Seed the form whenever the dialog opens for a different target.
  const key = open ? `${editing?.id || 'new'}:${defaultParentId || ''}` : null;
  if (key !== seededFor) {
    setSeededFor(key);
    if (open) {
      setName(editing?.name || '');
      setDescription(editing?.description || '');
      setParentId(editing ? editing.parentId : defaultParentId || null);
      setErrors({});
      setError(null);
    }
  }

  // A collection can't be moved inside itself or its descendants.
  const excluded = editing
    ? flatCollections.filter((c) => c.id === editing.id || c.path.startsWith(`${flatCollections.find((x) => x.id === editing.id)?.path} / `)).map((c) => c.id)
    : [];

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setErrors({ name: 'Give the collection a name' });
    setSaving(true);
    setError(null);
    try {
      const body = { name: name.trim(), description: description.trim(), parentId };
      if (editing) await collectionsApi.update(editing.id, body);
      else await collectionsApi.create(body);
      await refreshCollections();
      toast.success(editing ? 'Collection updated' : 'Collection created');
      onClose();
    } catch (err) {
      setErrors(err.fields || {});
      if (!Object.keys(err.fields || {}).length) setError(err.message);
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  return (
    <Dialog open={open} onClose={onClose} title={editing ? 'Edit collection' : 'New collection'}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <TextField label="Name" value={name} maxLength={80} error={errors.name} onChange={(e) => setName(e.target.value)} />
        <TextArea label="Description" optional rows={2} maxLength={280} value={description} error={errors.description} onChange={(e) => setDescription(e.target.value)} />
        <CollectionSelect label="Inside" noneLabel="Top level" value={parentId} onChange={setParentId} exclude={excluded} />
        <p className="font-ui text-xs text-ink-faint">Collections can be nested up to three levels deep.</p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {editing ? 'Save' : 'Create collection'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DeleteCollectionDialog({ target, onClose }) {
  const { refreshCollections, flatCollections } = useLibrary();
  const toast = useToast();
  const [moveTo, setMoveTo] = useState(null);
  const [deleting, setDeleting] = useState(false);
  if (!target) return <Dialog open={false} onClose={onClose} title="" />;
  const descendants = flatCollections.filter((c) => c.path.startsWith(`${target.path} / `));

  const remove = async () => {
    setDeleting(true);
    try {
      const res = await collectionsApi.remove(target.id, moveTo);
      await refreshCollections();
      toast.success(`Deleted “${target.name}”. ${res.movedResources} item${res.movedResources === 1 ? '' : 's'} kept${moveTo ? ' and moved' : ' as unfiled'}.`);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog
      open={Boolean(target)}
      onClose={onClose}
      tone="danger"
      title={`Delete “${target.name}”?`}
      description="Only the collection is deleted. Nothing inside it is lost."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={deleting} onClick={remove}>
            Delete collection
          </Button>
        </>
      }
    >
      <ul className="mb-4 list-disc space-y-1 pl-5 font-ui text-sm text-ink-muted">
        <li>
          Its {target.count} item{target.count === 1 ? '' : 's'} will be kept {moveTo ? 'and moved to the collection below' : 'as unfiled'}.
        </li>
        {descendants.length > 0 && <li>Its {descendants.length} sub-collection{descendants.length === 1 ? '' : 's'} will move up one level.</li>}
      </ul>
      <CollectionSelect label="Move its items to" noneLabel="Unfiled" value={moveTo} onChange={setMoveTo} exclude={[target.id, ...descendants.map((d) => d.id)]} />
    </Dialog>
  );
}

function TagRow({ tag }) {
  const { refreshTags } = useLibrary();
  const toast = useToast();
  const { theme } = useTheme();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const rename = async (e) => {
    e.preventDefault();
    if (!name.trim() || name.trim() === tag.name) return setEditing(false);
    setBusy(true);
    try {
      await tagsApi.update(tag.id, { name: name.trim() });
      await refreshTags();
      setEditing(false);
      toast.success('Tag renamed');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await tagsApi.remove(tag.id);
      await refreshTags();
      toast.success(`Deleted tag “${tag.name}”. Removed from ${res.detachedFrom} item${res.detachedFrom === 1 ? '' : 's'}.`);
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  return (
    <li className="flex items-center gap-2 py-2">
      {editing ? (
        <form onSubmit={rename} className="flex flex-1 items-center gap-2">
          <label htmlFor={`tag-${tag.id}`} className="sr-only">
            Tag name
          </label>
          <input id={`tag-${tag.id}`} autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setEditing(false)} className="mm-input !min-h-9 !py-1 text-sm" />
          <Button type="submit" size="sm" iconOnly icon={Check} loading={busy} aria-label="Save tag name" />
          <Button variant="ghost" size="sm" iconOnly icon={X} aria-label="Cancel" onClick={() => setEditing(false)} />
        </form>
      ) : (
        <>
          <Link to={`/vault?tags=${tag.id}`} className="flex min-w-0 flex-1 items-center gap-2 font-ui text-sm text-ink hover:text-accent">
            <TagIcon size={14} className="shrink-0 text-ink-faint" aria-hidden />
            <span className="truncate">{theme === 'lab' ? `#${tag.name}` : tag.name}</span>
            <span className="font-mono text-[0.68rem] text-ink-faint">{tag.count}</span>
          </Link>
          {confirm ? (
            <span className="flex items-center gap-1">
              <span className="font-ui text-xs text-ink-muted">Delete?</span>
              <Button variant="danger" size="sm" loading={busy} onClick={remove}>
                Yes
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
                No
              </Button>
            </span>
          ) : (
            <span className="flex gap-0.5">
              <Button variant="ghost" size="sm" iconOnly icon={Pencil} aria-label={`Rename tag ${tag.name}`} onClick={() => setEditing(true)} />
              <Button variant="ghost" size="sm" iconOnly icon={Trash2} aria-label={`Delete tag ${tag.name}`} onClick={() => setConfirm(true)} />
            </span>
          )}
        </>
      )}
    </li>
  );
}

function NewTagForm() {
  const { refreshTags } = useLibrary();
  const toast = useToast();
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return undefined;
    setBusy(true);
    setError(null);
    try {
      await tagsApi.create({ name: name.trim() });
      await refreshTags();
      setName('');
      toast.success('Tag created');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
    return undefined;
  };
  return (
    <form onSubmit={submit} className="mt-4">
      <div className="flex gap-2">
        <label htmlFor="new-tag" className="sr-only">
          New tag
        </label>
        <input id="new-tag" className="mm-input" placeholder="New tag name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-invalid={error ? 'true' : undefined} />
        <Button type="submit" variant="secondary" icon={Plus} loading={busy} disabled={!name.trim()}>
          Add
        </Button>
      </div>
      {error && <p className="mt-1.5 font-ui text-xs text-danger">{error}</p>}
    </form>
  );
}

export default function CollectionsPage() {
  const { flatCollections, unfiledCount, tags, loading, error } = useLibrary();
  const { theme } = useTheme();
  const [dialog, setDialog] = useState(null); // { editing?, parentId? }
  const [deleting, setDeleting] = useState(null);
  const [menuFor, setMenuFor] = useState(null);

  return (
    <>
      <PageHeader
        eyebrow={theme === 'library' ? 'The Stacks' : theme === 'lab' ? '02 / Data' : 'Organise'}
        title="Collections & tags"
        description="Group your knowledge into nested collections and label it with tags. Deleting a collection or tag never deletes your items."
        actions={
          <Button icon={FolderPlus} onClick={() => setDialog({})}>
            New collection
          </Button>
        }
      />
      {error && <Alert tone="error" className="mb-6">{error}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5 sm:p-6">
          <CardHeader eyebrow="Collections" title={`${flatCollections.length} ${flatCollections.length === 1 ? 'collection' : 'collections'}`} />
          {loading ? (
            <div className="mt-4 space-y-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : flatCollections.length === 0 ? (
            <EmptyState icon={Folder} title="No collections yet" compact action={<Button size="sm" icon={FolderPlus} onClick={() => setDialog({})}>Create a collection</Button>}>
              Collections hold related notes, documents and links, like a course, project or reading list.
            </EmptyState>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {flatCollections.map((c) => (
                <li key={c.id} className="relative flex items-center gap-2 py-2" style={{ paddingLeft: `${c.depth * 1.25}rem` }}>
                  <Folder size={16} className="shrink-0 text-accent" aria-hidden />
                  <Link to={`/vault?collection=${c.id}`} className="min-w-0 flex-1 hover:text-accent">
                    <span className="block truncate font-ui text-sm font-semibold text-ink">{c.name}</span>
                    {c.description && <span className="block truncate font-ui text-xs text-ink-muted">{c.description}</span>}
                  </Link>
                  <span className="font-mono text-[0.7rem] text-ink-faint" title="Items directly in this collection">
                    {c.count}
                  </span>
                  <div className="relative">
                    <Button variant="ghost" size="sm" iconOnly icon={MoreHorizontal} aria-label={`Actions for ${c.name}`} aria-expanded={menuFor === c.id} onClick={() => setMenuFor(menuFor === c.id ? null : c.id)} />
                    {menuFor === c.id && (
                      <div className="mm-card absolute right-0 z-30 mt-1 w-48 p-1 shadow-raised" role="menu" onMouseLeave={() => setMenuFor(null)}>
                        {[
                          { label: 'Edit', icon: Pencil, run: () => setDialog({ editing: c }) },
                          ...(c.depth < 2 ? [{ label: 'Add sub-collection', icon: FolderPlus, run: () => setDialog({ parentId: c.id }) }] : []),
                          { label: 'Delete', icon: Trash2, run: () => setDeleting(c), danger: true },
                        ].map((a) => (
                          <button
                            key={a.label}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenuFor(null);
                              a.run();
                            }}
                            className={`flex w-full items-center gap-2 rounded-control px-2.5 py-1.5 text-left font-ui text-sm hover:bg-sunken ${a.danger ? 'text-danger' : 'text-ink'}`}
                          >
                            <a.icon size={14} aria-hidden />
                            {a.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!loading && (
            <p className="mt-4 font-ui text-xs text-ink-faint">
              <Link to="/vault?collection=none" className="hover:text-accent">
                {unfiledCount} unfiled item{unfiledCount === 1 ? '' : 's'}
              </Link>
            </p>
          )}
        </Card>

        <Card className="p-5 sm:p-6">
          <CardHeader eyebrow="Tags" title={`${tags?.length || 0} ${tags?.length === 1 ? 'tag' : 'tags'}`} />
          {loading ? (
            <Skeleton className="mt-4 h-24" />
          ) : tags.length === 0 ? (
            <p className="mt-3 font-ui text-sm text-ink-muted">No tags yet. Create one here, or add tags while editing any item.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {tags.map((t) => (
                <TagRow key={t.id} tag={t} />
              ))}
            </ul>
          )}
          <NewTagForm />
        </Card>
      </div>

      <CollectionDialog open={Boolean(dialog)} onClose={() => setDialog(null)} editing={dialog?.editing} defaultParentId={dialog?.parentId} />
      <DeleteCollectionDialog key={deleting?.id || "none"} target={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}
