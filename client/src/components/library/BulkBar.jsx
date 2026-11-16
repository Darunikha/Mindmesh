import { useState } from 'react';
import { createPortal } from 'react-dom';
import { FolderInput, Pin, PinOff, Tags, Trash2, X } from 'lucide-react';
import Button from '../ui/Button.jsx';
import Dialog from '../ui/Dialog.jsx';
import CollectionSelect from './CollectionSelect.jsx';
import TagPicker from './TagPicker.jsx';
import { libraryApi } from '../../api/library.js';
import { useToast } from '../../context/ToastContext.jsx';

const BATCH = 100; // the API accepts at most 100 ids per request

async function runBulk(ids, body) {
  let affected = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const res = await libraryApi.bulk({
      ...body,
      ids: ids.slice(i, i + BATCH),
    });
    affected += res.affected;
  }
  return affected;
}

const plural = (n) => `${n} ${n === 1 ? 'item' : 'items'}`;

/**
 * Floating action bar for the Vault's select mode.
 * `onDone(kind)` runs after a successful change so the page can refresh.
 */
export default function BulkBar({ select, loadedIds, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null); // 'move' | 'tags' | 'delete'
  const [collectionId, setCollectionId] = useState(null);
  const [tagNames, setTagNames] = useState([]);

  const ids = [...select.ids];
  const n = ids.length;
  const allLoadedSelected = loadedIds.length > 0 && loadedIds.every((id) => select.has(id));

  const apply = async (body, message, kind) => {
    setBusy(true);
    try {
      const affected = await runBulk(ids, body);
      toast.success(message(affected));
      setDialog(null);
      select.clear();
      onDone(kind);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const openDialog = (name) => {
    setCollectionId(null);
    setTagNames([]);
    setDialog(name);
  };

  return (
    <>
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-3 z-[60] px-3 sm:bottom-5 lg:pl-[calc(var(--mm-sidebar-offset)+0.75rem)]">
          <div
            role="region"
            aria-label="Bulk actions"
            className="pointer-events-auto mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-[var(--mm-r-card,16px)] border border-line bg-surface p-2.5 shadow-raised sm:gap-3 sm:p-3"
          >
            <p className="min-w-[6.5rem] px-1 font-ui text-sm font-semibold text-ink lab:font-mono lab:text-xs" aria-live="polite">
              {n === 0 ? 'Select items' : `${n} selected`}
            </p>
            <button
              type="button"
              className="font-ui text-xs text-ink-muted underline underline-offset-2 hover:text-ink"
              onClick={() => (allLoadedSelected ? select.clear() : select.selectAll(loadedIds))}
            >
              {allLoadedSelected ? 'Select none' : `Select all ${loadedIds.length} shown`}
            </button>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="secondary" icon={Pin} disabled={!n || busy} onClick={() => apply({ action: 'pin' }, (a) => `Pinned ${plural(a)}`, 'pin')}>
                Pin
              </Button>
              <Button size="sm" variant="secondary" icon={PinOff} disabled={!n || busy} onClick={() => apply({ action: 'unpin' }, (a) => `Unpinned ${plural(a)}`, 'pin')}>
                Unpin
              </Button>
              <Button size="sm" variant="secondary" icon={FolderInput} disabled={!n || busy} onClick={() => openDialog('move')}>
                Move
              </Button>
              <Button size="sm" variant="secondary" icon={Tags} disabled={!n || busy} onClick={() => openDialog('tags')}>
                Tag
              </Button>
              <Button size="sm" variant="danger-ghost" icon={Trash2} disabled={!n || busy} onClick={() => openDialog('delete')}>
                Delete
              </Button>
              <Button size="sm" variant="ghost" icon={X} onClick={() => select.setActive(false)}>
                Done
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <Dialog
        open={dialog === 'move'}
        onClose={() => setDialog(null)}
        title={`Move ${plural(n)}`}
        description="Pick where they should live. Moving never changes the items themselves."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={() => apply({ action: 'move', collectionId }, (a) => `Moved ${plural(a)}`, 'move')}>
              Move
            </Button>
          </>
        }
      >
        <CollectionSelect value={collectionId} onChange={setCollectionId} label="Collection" noneLabel="No collection (unfiled)" />
      </Dialog>

      <Dialog
        open={dialog === 'tags'}
        onClose={() => setDialog(null)}
        title={`Add tags to ${plural(n)}`}
        description="These tags are added. Existing tags on each item stay."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button loading={busy} disabled={!tagNames.length} onClick={() => apply({ action: 'addTags', tags: tagNames }, (a) => `Tagged ${plural(a)}`, 'tags')}>
              Add tags
            </Button>
          </>
        }
      >
        <TagPicker value={tagNames} onChange={setTagNames} />
      </Dialog>

      <Dialog
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        tone="danger"
        title={`Delete ${plural(n)}?`}
        description="They will be removed permanently, including any uploaded files. Flashcards made from them are kept. This can’t be undone."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={() => apply({ action: 'delete' }, (a) => `Deleted ${plural(a)}`, 'delete')}>
              Delete {plural(n)}
            </Button>
          </>
        }
      />
    </>
  );
}
