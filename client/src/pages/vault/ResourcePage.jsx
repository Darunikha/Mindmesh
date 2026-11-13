import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, FileQuestion, Pencil, Pin, PinOff, Trash2, X } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import Dialog from '../../components/ui/Dialog.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import DetailsPanel from '../../components/library/DetailsPanel.jsx';
import RelatedPanel from '../../components/library/RelatedPanel.jsx';
import FlashcardsPanel from '../../components/flashcards/FlashcardsPanel.jsx';
import { StatusBadge, TypeBadge } from '../../components/library/Badges.jsx';
import { libraryApi } from '../../api/library.js';
import { useLibrary } from '../../context/LibraryContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useProcessingPoll } from '../../hooks/useProcessingPoll.js';
import { resourceDetail } from '../../components/library/resourceMeta.js';
import NoteView from './NoteView.jsx';
import DocumentView from './DocumentView.jsx';
import LinkView from './LinkView.jsx';

function InlineTitle({ resource, onSaved }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(resource.title);
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e?.preventDefault();
    const v = value.trim();
    if (!v || v === resource.title) return setEditing(false);
    setSaving(true);
    try {
      const { resource: updated } = await libraryApi.update(resource.id, { title: v });
      onSaved(updated);
      setEditing(false);
      toast.success('Renamed');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  if (editing) {
    return (
      <form onSubmit={save} className="flex items-center gap-2">
        <label htmlFor="rename" className="sr-only">
          Title
        </label>
        <input id="rename" autoFocus value={value} maxLength={300} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setEditing(false)} className="mm-input font-display !text-2xl" />
        <Button type="submit" iconOnly icon={Check} loading={saving} aria-label="Save title" />
        <Button variant="ghost" iconOnly icon={X} aria-label="Cancel rename" onClick={() => setEditing(false)} />
      </form>
    );
  }
  return (
    <div className="group flex items-start gap-2">
      <h1 className="mm-display min-w-0 text-3xl break-words text-ink sm:text-4xl library:text-[2.6rem]">{resource.title}</h1>
      <button
        type="button"
        onClick={() => {
          setValue(resource.title);
          setEditing(true);
        }}
        className="mt-2 rounded-control p-1.5 text-ink-faint opacity-60 group-hover:opacity-100 hover:bg-sunken hover:text-ink"
        aria-label="Rename"
        title="Rename"
      >
        <Pencil size={16} />
      </button>
    </div>
  );
}

export default function ResourcePage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { refreshCollections, refreshTags, collectionById } = useLibrary();
  const [resource, setResource] = useState(null);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  useEffect(() => {
    let alive = true;
    setResource(null);
    setError(null);
    libraryApi
      .get(id)
      .then((d) => alive && setResource(d.resource))
      .catch((err) => alive && setError(err));
    return () => {
      alive = false;
    };
  }, [id]);

  const onChange = useCallback((updated, { fromSave } = {}) => {
    // Note saves return content too, but the editor owns the live document; avoid re-seeding it.
    setResource((prev) => (fromSave && prev ? { ...updated, note: { ...updated.note, content: prev.note.content } } : updated));
  }, []);

  useProcessingPoll(resource ? [resource] : [], (u) => setResource((prev) => ({ ...u, note: prev?.note })));

  const togglePin = async () => {
    try {
      const { resource: updated } = await libraryApi.update(resource.id, { pinned: !resource.pinned });
      setResource((prev) => ({ ...updated, note: prev.note }));
      toast.success(updated.pinned ? 'Pinned' : 'Unpinned');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await libraryApi.remove(resource.id);
      refreshCollections();
      refreshTags();
      toast.success(`Deleted “${resource.title}”`);
      navigate('/vault', { replace: true });
    } catch (err) {
      toast.error(err.message);
      setDeleting(false);
    }
  };

  if (error) {
    return (
      <div className="mm-card">
        <EmptyState icon={FileQuestion} title={error.status === 404 ? 'Item not found' : 'Could not load this item'} action={<Button to="/vault" icon={ArrowLeft}>Back to the vault</Button>}>
          {error.status === 404 ? 'It may have been deleted.' : error.message}
        </EmptyState>
      </div>
    );
  }

  if (!resource) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-10 w-2/3" />
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <Skeleton className="h-[60vh]" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  const collection = resource.collectionId ? collectionById.get(resource.collectionId) : null;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 font-ui text-sm text-ink-muted">
          <Link to="/vault" className="inline-flex items-center gap-1.5 hover:text-accent">
            <ArrowLeft size={15} aria-hidden /> Vault
          </Link>
          {collection && (
            <>
              <span aria-hidden>/</span>
              <Link to={`/vault?collection=${collection.id}`} className="truncate hover:text-accent">
                {collection.name}
              </Link>
            </>
          )}
        </nav>
        <div className="flex items-center gap-2">
          {resource.type === 'note' && saveStatus}
          <Button variant="ghost" size="sm" icon={resource.pinned ? PinOff : Pin} onClick={togglePin} aria-pressed={resource.pinned}>
            {resource.pinned ? 'Unpin' : 'Pin'}
          </Button>
          <Button variant="danger-ghost" size="sm" icon={Trash2} onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        </div>
      </div>

      {resource.type !== 'note' && (
        <header className="mb-6">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <TypeBadge type={resource.type} />
            <span className="font-ui text-xs text-ink-faint">{resourceDetail(resource)}</span>
            <StatusBadge resource={resource} />
          </div>
          <InlineTitle resource={resource} onSaved={setResource} />
        </header>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {resource.type === 'note' && <NoteView key={resource.id} resource={resource} onChange={onChange} autoFocusTitle={location.state?.fresh} renderStatus={setSaveStatus} />}
          {resource.type === 'document' && <DocumentView resource={resource} />}
          {resource.type === 'link' && <LinkView resource={resource} />}
        </div>
        <aside aria-label="Item details" className="min-w-0 space-y-4">
          <RelatedPanel resourceId={resource.id} />
          <FlashcardsPanel resource={resource} />
          <DetailsPanel resource={resource} onChange={(u) => setResource((prev) => ({ ...u, note: u.note ? { ...u.note, content: prev.note?.content ?? u.note.content } : undefined }))} />
        </aside>
      </div>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        tone="danger"
        title={`Delete “${resource.title}”?`}
        description={
          resource.type === 'document'
            ? 'The file, its extracted text and its search index will be permanently removed.'
            : 'This item and its search index will be permanently removed.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={deleting} onClick={remove}>
              Delete permanently
            </Button>
          </>
        }
      />
    </div>
  );
}
