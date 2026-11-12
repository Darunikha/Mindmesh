import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import Card from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import Alert from '../ui/Alert.jsx';
import CollectionSelect from './CollectionSelect.jsx';
import TagPicker from './TagPicker.jsx';
import { StatusBadge } from './Badges.jsx';
import { libraryApi } from '../../api/library.js';
import { useLibrary } from '../../context/LibraryContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { formatDate } from '../../lib/format.js';
import { formatBytes } from './resourceMeta.js';

function Meta({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="font-ui text-xs text-ink-faint">{label}</dt>
      <dd className="min-w-0 truncate text-right font-ui text-xs text-ink lab:font-mono">{children}</dd>
    </div>
  );
}

const FAILURE_HELP = {
  ROBOTS_DISALLOWED: 'The link is saved as a bookmark, but its text is not searchable.',
  NO_TEXT: 'The item is saved, but nothing in it can be searched.',
  FETCH_BLOCKED: 'Private and local network addresses are blocked for security.',
};

/** Organisation, metadata and processing status for a single item. Saves immediately. */
export default function DetailsPanel({ resource, onChange }) {
  const { refreshCollections, refreshTags } = useLibrary();
  const toast = useToast();
  const [retrying, setRetrying] = useState(false);
  const p = resource.processing;

  const update = async (patch, message) => {
    try {
      const { resource: updated } = await libraryApi.update(resource.id, patch);
      onChange(updated);
      if (patch.collectionId !== undefined) refreshCollections();
      if (patch.tags) refreshTags();
      if (message) toast.success(message);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const retry = async () => {
    setRetrying(true);
    try {
      const { resource: updated } = await libraryApi.reprocess(resource.id);
      onChange(updated);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4">
        <CollectionSelect value={resource.collectionId} onChange={(v) => update({ collectionId: v }, v ? 'Moved to collection' : 'Removed from collection')} />
        <TagPicker value={resource.tags.map((t) => t.name)} onChange={(names) => update({ tags: names })} />
      </Card>

      {resource.type !== 'note' && (
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="mm-eyebrow">Processing</p>
            <StatusBadge resource={resource} showReady />
          </div>
          {p.status === 'failed' && (
            <Alert tone={p.code === 'ROBOTS_DISALLOWED' ? 'info' : 'error'} className="mb-3">
              {p.error}
              {FAILURE_HELP[p.code] && <span className="mt-1 block opacity-80">{FAILURE_HELP[p.code]}</span>}
            </Alert>
          )}
          {(p.status === 'pending' || p.status === 'processing') && (
            <p className="mb-3 font-ui text-xs text-ink-muted">Extracting and indexing text. This page updates automatically.</p>
          )}
          <dl className="divide-y divide-line">
            <Meta label="Passages">{p.chunkCount}</Meta>
            <Meta label="Characters">{p.charCount.toLocaleString()}</Meta>
            {p.completedAt && <Meta label="Processed">{formatDate(p.completedAt, { dateStyle: 'medium', timeStyle: 'short' })}</Meta>}
          </dl>
          {p.status === 'failed' && (
            <Button variant="secondary" size="sm" icon={RotateCcw} className="mt-3 w-full" loading={retrying} onClick={retry}>
              Try again
            </Button>
          )}
        </Card>
      )}

      <Card className="p-4">
        <p className="mm-eyebrow mb-2">Details</p>
        <dl className="divide-y divide-line">
          {resource.type === 'document' && (
            <>
              <Meta label="File">{resource.file.originalName}</Meta>
              <Meta label="Format">{resource.file.label}</Meta>
              <Meta label="Size">{formatBytes(resource.file.size)}</Meta>
              {resource.file.pageCount && <Meta label="Pages">{resource.file.pageCount}</Meta>}
            </>
          )}
          {resource.type === 'link' && (
            <>
              <Meta label="Domain">{resource.link.domain}</Meta>
              {resource.link.siteName && <Meta label="Site">{resource.link.siteName}</Meta>}
            </>
          )}
          {resource.type === 'note' && <Meta label="Words">{resource.note.wordCount.toLocaleString()}</Meta>}
          <Meta label="Created">{formatDate(resource.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</Meta>
          <Meta label="Updated">{formatDate(resource.updatedAt, { dateStyle: 'medium', timeStyle: 'short' })}</Meta>
        </dl>
      </Card>
    </div>
  );
}
