import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, RefreshCw } from 'lucide-react';
import RichTextEditor from '../../components/editor/RichTextEditor.jsx';
import SaveIndicator from '../../components/editor/SaveIndicator.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Button from '../../components/ui/Button.jsx';
import { libraryApi } from '../../api/library.js';
import { useAutosave } from '../../hooks/useAutosave.js';
import { useToast } from '../../context/ToastContext.jsx';

/**
 * Note editing with autosave. Content saves carry the revision they were based on, so edits
 * from another tab are detected instead of overwritten.
 */
export default function NoteView({ resource, onChange, autoFocusTitle, renderStatus }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [title, setTitle] = useState(resource.title === 'Untitled note' && autoFocusTitle ? '' : resource.title);
  const revision = useRef(resource.note.revision);
  const latestContent = useRef(resource.note.content);
  const titleRef = useRef(null);
  const [editorKey, setEditorKey] = useState(0);
  const [initialContent, setInitialContent] = useState(resource.note.content);

  const save = useCallback(
    async (patch) => {
      const body = {};
      if (patch.title !== undefined) body.title = patch.title.trim() || 'Untitled note';
      if (patch.content !== undefined) {
        body.content = patch.content;
        body.baseRevision = revision.current;
      }
      const { resource: updated } = await libraryApi.update(resource.id, body);
      revision.current = updated.note.revision;
      onChange(updated, { fromSave: true });
    },
    [resource.id, onChange]
  );

  const autosave = useAutosave(save);
  const { markDirty, flush } = autosave;

  useEffect(() => {
    if (autoFocusTitle) titleRef.current?.focus();
  }, [autoFocusTitle]);

  // Ctrl/Cmd+S saves immediately.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        flush();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flush]);

  useEffect(() => {
    renderStatus?.(<SaveIndicator state={autosave.state} lastSavedAt={autosave.lastSavedAt} onRetry={autosave.retry} />);
  }, [autosave.state, autosave.lastSavedAt, autosave.retry, renderStatus]);

  const reloadLatest = async () => {
    autosave.discardPending();
    const { resource: fresh } = await libraryApi.get(resource.id, { touch: false });
    revision.current = fresh.note.revision;
    latestContent.current = fresh.note.content;
    setTitle(fresh.title);
    setInitialContent(fresh.note.content);
    setEditorKey((k) => k + 1);
    onChange(fresh);
    toast.info('Loaded the latest version.');
  };

  const saveAsCopy = async () => {
    try {
      const { resource: copy } = await libraryApi.createNote({
        title: `${title.trim() || 'Untitled note'} (my version)`,
        content: latestContent.current,
        collectionId: resource.collectionId,
        tags: resource.tags.map((t) => t.name),
      });
      autosave.discardPending();
      toast.success('Saved your version as a new note.');
      navigate(`/vault/${copy.id}`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-4">
      {autosave.state === 'conflict' && (
        <Alert tone="error">
          <p className="font-semibold">This note was changed in another tab or device.</p>
          <p className="mt-1">To avoid overwriting those changes, autosave is paused. Load the latest version (your edits here will be discarded) or keep your edits as a separate note.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={RefreshCw} onClick={reloadLatest}>
              Load latest
            </Button>
            <Button size="sm" variant="secondary" icon={Copy} onClick={saveAsCopy}>
              Save mine as a copy
            </Button>
          </div>
        </Alert>
      )}
      {autosave.state === 'error' && autosave.error && <Alert tone="error">Couldn't save: {autosave.error.message}. Your changes are kept here. Retry from the status above.</Alert>}

      <div className="mm-card mm-card-ruled overflow-hidden">
        <div className="px-5 pt-6 sm:px-10 sm:pt-8">
          <label htmlFor="note-title" className="sr-only">
            Title
          </label>
          <input
            ref={titleRef}
            id="note-title"
            value={title}
            maxLength={300}
            placeholder="Untitled note"
            onChange={(e) => {
              setTitle(e.target.value);
              markDirty({ title: e.target.value });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                document.querySelector('.ProseMirror')?.focus();
              }
            }}
            className="w-full bg-transparent font-display text-3xl text-ink outline-none placeholder:text-ink-faint sm:text-4xl library:text-[2.6rem] library:italic"
          />
        </div>
        <RichTextEditor
          key={editorKey}
          content={initialContent}
          onChange={(json) => {
            latestContent.current = json;
            markDirty({ content: json });
          }}
        />
      </div>
    </div>
  );
}
