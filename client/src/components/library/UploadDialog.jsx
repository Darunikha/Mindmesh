import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, FileUp, RotateCcw, UploadCloud, X, XCircle } from 'lucide-react';
import Dialog from '../ui/Dialog.jsx';
import Button from '../ui/Button.jsx';
import CollectionSelect from './CollectionSelect.jsx';
import TagPicker from './TagPicker.jsx';
import { libraryApi, MAX_UPLOAD_MB, SUPPORTED_UPLOADS } from '../../api/library.js';
import { useLibrary } from '../../context/LibraryContext.jsx';
import { cn } from '../../lib/cn.js';
import { formatBytes } from './resourceMeta.js';

let seq = 0;

function validate(file) {
  const ext = `.${file.name.split('.').pop()}`.toLowerCase();
  if (!SUPPORTED_UPLOADS.includes(ext)) return `Unsupported type (${ext}).`;
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return `Larger than ${MAX_UPLOAD_MB} MB.`;
  if (file.size === 0) return 'This file is empty.';
  return null;
}

/**
 * Multi-file uploader: client-side pre-checks (the server re-validates everything),
 * per-file progress bars, cancel and retry. Uploads run two at a time.
 */
export default function UploadDialog({ open, onClose, initialFiles, defaultCollectionId, onUploaded }) {
  const { refreshTags, refreshCollections } = useLibrary();
  const [items, setItems] = useState([]);
  const [collectionId, setCollectionId] = useState(defaultCollectionId || null);
  const [tags, setTags] = useState([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const controllers = useRef(new Map());

  const patch = (id, p) => setItems((list) => list.map((it) => (it.id === id ? { ...it, ...p } : it)));

  const addFiles = useCallback((files) => {
    const next = [...files].map((file) => {
      const error = validate(file);
      return { id: ++seq, file, status: error ? 'invalid' : 'queued', progress: 0, error };
    });
    setItems((list) => [...list, ...next]);
  }, []);

  useEffect(() => {
    if (open) {
      setCollectionId(defaultCollectionId || null);
      if (initialFiles?.length) addFiles(initialFiles);
    }
  }, [open, initialFiles, defaultCollectionId, addFiles]);

  const uploadOne = useCallback(
    async (item) => {
      const controller = new AbortController();
      controllers.current.set(item.id, controller);
      patch(item.id, { status: 'uploading', progress: 0, error: null });
      try {
        const { resource } = await libraryApi.upload(item.file, { collectionId, tags }, { signal: controller.signal, onProgress: (p) => patch(item.id, { progress: p }) });
        patch(item.id, { status: 'done', progress: 1, resource });
        onUploaded?.(resource);
      } catch (err) {
        patch(item.id, { status: err.name === 'AbortError' ? 'cancelled' : 'error', error: err.name === 'AbortError' ? 'Cancelled' : err.message });
      } finally {
        controllers.current.delete(item.id);
      }
    },
    [collectionId, tags, onUploaded]
  );

  // Run queued uploads with a concurrency of two.
  useEffect(() => {
    const running = items.filter((i) => i.status === 'uploading').length;
    const queued = items.filter((i) => i.status === 'queued' && i.started);
    queued.slice(0, Math.max(0, 2 - running)).forEach((i) => {
      patch(i.id, { started: false });
      uploadOne(i);
    });
  }, [items, uploadOne]);

  const startAll = () => {
    setItems((list) => list.map((i) => (i.status === 'queued' ? { ...i, started: true } : i)));
  };

  const finished = items.length > 0 && items.every((i) => ['done', 'invalid', 'error', 'cancelled'].includes(i.status));
  const busy = items.some((i) => i.status === 'uploading' || (i.status === 'queued' && i.started));
  const pending = items.filter((i) => i.status === 'queued' && !i.started).length;

  const close = () => {
    controllers.current.forEach((c) => c.abort());
    if (items.some((i) => i.status === 'done')) {
      refreshTags();
      refreshCollections();
    }
    setItems([]);
    setTags([]);
    onClose();
  };

  return (
    <Dialog open={open} onClose={close} title="Upload documents" description={`PDF, Word (.docx), text, Markdown, CSV, JSON, HTML or RTF, up to ${MAX_UPLOAD_MB} MB each.`}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-4 py-7 text-center transition-colors',
          dragging ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface-2'
        )}
      >
        <UploadCloud size={26} className="text-accent" aria-hidden />
        <p className="font-ui text-sm text-ink">Drag files here, or</p>
        <Button size="sm" variant="secondary" icon={FileUp} onClick={() => inputRef.current?.click()}>
          Choose files
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={SUPPORTED_UPLOADS.join(',')}
          className="sr-only"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
          aria-label="Choose files to upload"
        />
      </div>

      {items.length > 0 && (
        <ul className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1" aria-live="polite">
          {items.map((it) => (
            <li key={it.id} className="rounded-control border border-line bg-surface px-3 py-2">
              <div className="flex items-center gap-2">
                {it.status === 'done' ? (
                  <CheckCircle2 size={15} className="shrink-0 text-success" aria-hidden />
                ) : ['error', 'invalid', 'cancelled'].includes(it.status) ? (
                  <XCircle size={15} className="shrink-0 text-danger" aria-hidden />
                ) : (
                  <FileUp size={15} className="shrink-0 text-ink-muted" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate font-ui text-sm text-ink">{it.file.name}</span>
                <span className="shrink-0 font-ui text-xs text-ink-faint">{formatBytes(it.file.size)}</span>
                {it.status === 'uploading' && (
                  <button type="button" className="rounded p-0.5 text-ink-faint hover:text-ink" onClick={() => controllers.current.get(it.id)?.abort()} aria-label={`Cancel ${it.file.name}`}>
                    <X size={14} />
                  </button>
                )}
                {['error', 'cancelled'].includes(it.status) && (
                  <button type="button" className="rounded p-0.5 text-ink-faint hover:text-ink" onClick={() => uploadOne(it)} aria-label={`Retry ${it.file.name}`}>
                    <RotateCcw size={14} />
                  </button>
                )}
                {['queued', 'invalid'].includes(it.status) && !it.started && (
                  <button type="button" className="rounded p-0.5 text-ink-faint hover:text-ink" onClick={() => setItems((l) => l.filter((x) => x.id !== it.id))} aria-label={`Remove ${it.file.name}`}>
                    <X size={14} />
                  </button>
                )}
              </div>
              {it.status === 'uploading' && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(it.progress * 100)} aria-label={`Uploading ${it.file.name}`}>
                  <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(it.progress * 100)}%` }} />
                </div>
              )}
              {it.error && <p className="mt-1 font-ui text-xs text-danger">{it.error}</p>}
              {it.status === 'done' && (
                <p className="mt-1 font-ui text-xs text-ink-muted">
                  Uploaded. Text extraction is running in the background.{' '}
                  <Link to={`/vault/${it.resource.id}`} className="text-accent underline-offset-2 hover:underline" onClick={close}>
                    Open
                  </Link>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {pending > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <CollectionSelect value={collectionId} onChange={setCollectionId} />
          <TagPicker value={tags} onChange={setTags} compact />
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={close}>
          {finished ? 'Done' : 'Close'}
        </Button>
        {pending > 0 && (
          <Button icon={UploadCloud} onClick={startAll} loading={busy && pending === 0}>
            Upload {pending} {pending === 1 ? 'file' : 'files'}
          </Button>
        )}
      </div>
    </Dialog>
  );
}
