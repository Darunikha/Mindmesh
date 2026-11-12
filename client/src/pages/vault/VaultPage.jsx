import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FilePlus2, LayoutGrid, Link2, List, Search, SearchX, Upload, X, LibraryBig } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader.jsx';
import Button from '../../components/ui/Button.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ResourceCard from '../../components/library/ResourceCard.jsx';
import ResourceList from '../../components/library/ResourceList.jsx';
import VaultSidebar from '../../components/library/VaultSidebar.jsx';
import UploadDialog from '../../components/library/UploadDialog.jsx';
import LinkDialog from '../../components/library/LinkDialog.jsx';
import { TypeBadge } from '../../components/library/Badges.jsx';
import { TYPE_PLURALS, resourcePath } from '../../components/library/resourceMeta.js';
import { libraryApi } from '../../api/library.js';
import { useLibrary } from '../../context/LibraryContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { usePreferences } from '../../hooks/usePreferences.js';
import { useDebouncedValue, useProcessingPoll } from '../../hooks/useProcessingPoll.js';
import { relativeTime } from '../../lib/format.js';
import { cn } from '../../lib/cn.js';

const PAGE_SIZE = 24;

function readFilters(params) {
  return {
    q: params.get('q') || '',
    type: params.get('type') || '',
    collection: params.get('collection') || null,
    tags: (params.get('tags') || '').split(',').filter(Boolean),
    pinned: params.get('pinned') || null,
    sort: params.get('sort') || '',
  };
}

function Segmented({ value, onChange, options, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-control border border-line bg-surface p-0.5 studio:rounded-full studio:border-transparent studio:bg-sunken">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex items-center gap-1.5 rounded-[calc(var(--mm-r-control)-2px)] px-2.5 py-1.5 font-ui text-[0.82rem] whitespace-nowrap transition-colors studio:rounded-full lab:font-mono lab:text-[0.7rem] lab:uppercase lab:tracking-wider',
            value === o.value ? 'bg-accent-soft text-accent font-semibold studio:bg-surface studio:text-ink studio:shadow-card' : 'text-ink-muted hover:text-ink'
          )}
          aria-label={o.ariaLabel}
          title={o.ariaLabel}
        >
          {o.icon && <o.icon size={14} aria-hidden />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function MiniList({ title, items }) {
  if (!items?.length) return null;
  return (
    <section className="mm-card p-4" aria-label={title}>
      <p className="mm-eyebrow mb-3">{title}</p>
      <ul className="space-y-1">
        {items.map((r) => (
          <li key={r.id}>
            <Link to={resourcePath(r)} className="group flex items-center gap-3 rounded-control px-2 py-1.5 hover:bg-sunken">
              <TypeBadge type={r.type} className="w-20 shrink-0" />
              <span className="min-w-0 flex-1 truncate font-ui text-sm text-ink group-hover:text-accent library:font-display library:text-base">{r.title}</span>
              <span className="shrink-0 font-ui text-xs text-ink-faint">{relativeTime(r.lastAccessedAt || r.createdAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function VaultPage() {
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const navigate = useNavigate();
  const { theme } = useTheme();
  const toast = useToast();
  const { collectionById, tagById, refreshCollections, refreshTags } = useLibrary();
  const { preferences, save: savePrefs } = usePreferences();

  const view = params.get('view') || preferences.library.defaultView;
  const sort = filters.sort || (filters.q ? 'relevance' : preferences.library.defaultSort);

  const [searchDraft, setSearchDraft] = useState(filters.q);
  const debouncedSearch = useDebouncedValue(searchDraft, 300);
  const [data, setData] = useState({ items: [], total: 0, hasMore: false, page: 1 });
  const [status, setStatus] = useState('loading'); // loading | ready | error | loadingMore
  const [error, setError] = useState(null);
  const [overview, setOverview] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(params.get('upload') === '1');
  const [droppedFiles, setDroppedFiles] = useState(null);
  const [linkOpen, setLinkOpen] = useState(params.get('link') === '1');
  const [creating, setCreating] = useState(false);
  const [dragging, setDragging] = useState(false);
  const requestId = useRef(0);

  const setFilters = useCallback(
    (patch) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) next.delete(k);
            else next.set(k, Array.isArray(v) ? v.join(',') : String(v));
          }
          next.delete('upload');
          next.delete('link');
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  // Keep the URL in sync with the (debounced) search box.
  useEffect(() => {
    if (debouncedSearch.trim() !== filters.q) setFilters({ q: debouncedSearch.trim() || null, sort: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const queryKey = JSON.stringify({ ...filters, sort });

  const load = useCallback(
    async (page = 1) => {
      const id = ++requestId.current;
      setStatus(page === 1 ? 'loading' : 'loadingMore');
      setError(null);
      try {
        const res = await libraryApi.list({
          q: filters.q || undefined,
          type: filters.type || undefined,
          collection: filters.collection || undefined,
          tags: filters.tags,
          pinned: filters.pinned || undefined,
          sort,
          page,
          limit: PAGE_SIZE,
        });
        if (id !== requestId.current) return;
        setData((prev) => ({ ...res, items: page === 1 ? res.items : [...prev.items, ...res.items] }));
        setStatus('ready');
      } catch (err) {
        if (id !== requestId.current) return;
        setError(err.message);
        setStatus('error');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryKey]
  );

  const loadOverview = useCallback(() => libraryApi.overview().then(setOverview).catch(() => {}), []);

  useEffect(() => {
    load(1);
  }, [load]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const onItemUpdate = useCallback((updated) => {
    setData((d) => ({ ...d, items: d.items.map((i) => (i.id === updated.id ? { ...updated, match: i.match } : i)) }));
  }, []);
  useProcessingPoll(data.items, onItemUpdate);

  const onAdded = useCallback(() => {
    load(1);
    loadOverview();
    refreshCollections();
  }, [load, loadOverview, refreshCollections]);

  const newNote = async () => {
    setCreating(true);
    try {
      const { resource } = await libraryApi.createNote({ collectionId: filters.collection && filters.collection !== 'none' ? filters.collection : undefined });
      refreshCollections();
      navigate(resourcePath(resource), { state: { fresh: true } });
    } catch (err) {
      toast.error(err.message);
      setCreating(false);
    }
  };

  const setView = (v) => {
    setFilters({ view: v });
    if (v !== preferences.library.defaultView) savePrefs({ library: { defaultView: v } }, { successMessage: null });
  };

  const isFiltered = Boolean(filters.q || filters.type || filters.collection || filters.tags.length || filters.pinned);
  const libraryEmpty = overview && overview.counts.total === 0;
  const activeCollection = filters.collection && filters.collection !== 'none' ? collectionById.get(filters.collection) : null;
  const defaultCollectionId = activeCollection?.id || null;

  const heading = useMemo(() => {
    if (activeCollection) return activeCollection.name;
    if (filters.collection === 'none') return 'Unfiled';
    if (filters.pinned === 'true') return 'Pinned';
    return 'Knowledge Vault';
  }, [activeCollection, filters.collection, filters.pinned]);

  const typeOptions = [
    { value: '', label: 'All' },
    { value: 'note', label: TYPE_PLURALS[theme].note },
    { value: 'document', label: TYPE_PLURALS[theme].document },
    { value: 'link', label: TYPE_PLURALS[theme].link },
  ];

  return (
    <div
      onDragOver={(e) => {
        if ([...e.dataTransfer.types].includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        setDroppedFiles([...e.dataTransfer.files]);
        setUploadOpen(true);
      }}
      className="relative"
    >
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-accent-soft/80 backdrop-blur-sm">
          <div className="mm-card flex flex-col items-center gap-2 p-8 text-center">
            <Upload size={28} className="text-accent" aria-hidden />
            <p className="font-display text-xl text-ink">Drop to upload</p>
          </div>
        </div>
      )}

      <PageHeader
        eyebrow={activeCollection ? activeCollection.path : theme === 'library' ? 'The Stacks' : theme === 'lab' ? '02 / Data' : 'Knowledge'}
        title={heading}
        description={activeCollection?.description || 'Notes, documents and links, all searchable in one place.'}
        actions={
          <>
            <Button icon={FilePlus2} onClick={newNote} loading={creating}>
              New note
            </Button>
            <Button variant="secondary" icon={Upload} onClick={() => setUploadOpen(true)}>
              Upload
            </Button>
            <Button variant="secondary" icon={Link2} onClick={() => setLinkOpen(true)}>
              Save link
            </Button>
          </>
        }
      />

      {libraryEmpty ? (
        <div className="mm-card mm-card-ruled px-6 py-14">
          <EmptyState
            icon={LibraryBig}
            title={theme === 'library' ? 'Your shelves are empty' : theme === 'lab' ? 'No records indexed' : 'Nothing here yet'}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button icon={FilePlus2} onClick={newNote} loading={creating}>
                  Write a note
                </Button>
                <Button variant="secondary" icon={Upload} onClick={() => setUploadOpen(true)}>
                  Upload a document
                </Button>
                <Button variant="secondary" icon={Link2} onClick={() => setLinkOpen(true)}>
                  Save a link
                </Button>
              </div>
            }
          >
            Add your first note, PDF, Word document or web page. Everything you add becomes searchable, and in Phase 3 the assistant can answer from it.
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
          <aside className="hidden lg:block" aria-label="Vault navigation">
            <div className="sticky top-6">
              <VaultSidebar filters={filters} setFilters={setFilters} />
            </div>
          </aside>

          <div className="min-w-0 space-y-5">
            {/* Search + controls */}
            <div className="space-y-3">
              <div className="relative">
                <Search size={17} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-faint" aria-hidden />
                <label htmlFor="vault-search" className="sr-only">
                  Search your library
                </label>
                <input
                  id="vault-search"
                  type="search"
                  className="mm-input !min-h-[3rem] !pl-10 text-[0.98rem]"
                  placeholder={theme === 'lab' ? 'query titles, tags, full text…' : 'Search titles and everything inside your notes, documents and links…'}
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  maxLength={200}
                />
                {searchDraft && (
                  <button type="button" onClick={() => setSearchDraft('')} className="absolute top-1/2 right-3 -translate-y-1/2 rounded-control p-1 text-ink-faint hover:text-ink" aria-label="Clear search">
                    <X size={15} />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="overflow-x-auto">
                  <Segmented label="Filter by type" value={filters.type} onChange={(v) => setFilters({ type: v || null })} options={typeOptions} />
                </div>
                {/* Mobile collection picker */}
                <select
                  className="mm-input !min-h-9 !w-auto !py-1 text-sm lg:hidden"
                  aria-label="Collection"
                  value={filters.collection || ''}
                  onChange={(e) => setFilters({ collection: e.target.value || null, pinned: null })}
                >
                  <option value="">All collections</option>
                  <option value="none">Unfiled</option>
                  {[...collectionById.values()].map((c) => (
                    <option key={c.id} value={c.id}>
                      {`${'  '.repeat(c.depth)}${c.name}`}
                    </option>
                  ))}
                </select>
                <div className="ml-auto flex items-center gap-2">
                  <label htmlFor="vault-sort" className="sr-only">
                    Sort
                  </label>
                  <select id="vault-sort" className="mm-input !min-h-9 !w-auto !py-1 text-sm" value={sort} onChange={(e) => setFilters({ sort: e.target.value })}>
                    {filters.q && <option value="relevance">Best match</option>}
                    <option value="updated">Recently updated</option>
                    <option value="created">Recently added</option>
                    <option value="accessed">Recently opened</option>
                    <option value="title">Title A–Z</option>
                  </select>
                  <Segmented
                    label="View"
                    value={view}
                    onChange={setView}
                    options={[
                      { value: 'grid', icon: LayoutGrid, ariaLabel: 'Grid view' },
                      { value: 'list', icon: List, ariaLabel: 'List view' },
                    ]}
                  />
                </div>
              </div>

              {(filters.tags.length > 0 || filters.collection || filters.pinned) && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {filters.collection && (
                    <button type="button" className="mm-chip" aria-pressed="true" onClick={() => setFilters({ collection: null })}>
                      {filters.collection === 'none' ? 'Unfiled' : collectionById.get(filters.collection)?.name || 'Collection'} <X size={11} aria-hidden />
                      <span className="sr-only">Remove filter</span>
                    </button>
                  )}
                  {filters.pinned && (
                    <button type="button" className="mm-chip" aria-pressed="true" onClick={() => setFilters({ pinned: null })}>
                      Pinned <X size={11} aria-hidden />
                    </button>
                  )}
                  {filters.tags.map((t) => (
                    <button key={t} type="button" className="mm-chip" aria-pressed="true" onClick={() => setFilters({ tags: filters.tags.filter((x) => x !== t) })}>
                      {tagById.get(t)?.name || 'Tag'} <X size={11} aria-hidden />
                    </button>
                  ))}
                  <button type="button" className="font-ui text-xs text-ink-muted underline-offset-2 hover:underline" onClick={() => setParams({}, { replace: true })}>
                    Clear all
                  </button>
                </div>
              )}
            </div>

            {/* Pinned + recents when browsing the whole vault */}
            {!isFiltered && overview && (overview.pinned.length > 0 || overview.recentlyAccessed.length > 0) && (
              <div className="grid gap-4 xl:grid-cols-2">
                <MiniList title="Pinned" items={overview.pinned.slice(0, 5)} />
                <MiniList title="Recently opened" items={overview.recentlyAccessed.slice(0, 5)} />
              </div>
            )}

            {/* Results */}
            <section aria-label="Library items" aria-busy={status === 'loading'}>
              <div className="mb-3 flex items-baseline justify-between">
                <p className="mm-eyebrow">{filters.q ? `Results for “${filters.q}”` : isFiltered ? 'Filtered items' : 'All items'}</p>
                {status !== 'loading' && status !== 'error' && (
                  <p className="font-ui text-xs text-ink-faint lab:font-mono" aria-live="polite">
                    {data.total} {data.total === 1 ? 'item' : 'items'}
                  </p>
                )}
              </div>

              {status === 'error' && (
                <Alert tone="error">
                  {error}{' '}
                  <button type="button" className="underline" onClick={() => load(1)}>
                    Try again
                  </button>
                </Alert>
              )}

              {status === 'loading' && (
                <div className={view === 'grid' ? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3' : 'space-y-2'}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className={view === 'grid' ? 'h-56' : 'h-14'} />
                  ))}
                </div>
              )}

              {status !== 'loading' && status !== 'error' && data.items.length === 0 && (
                <div className="mm-card">
                  <EmptyState
                    icon={SearchX}
                    title={filters.q ? 'No matches' : 'Nothing here'}
                    action={
                      isFiltered ? (
                        <Button variant="secondary" size="sm" onClick={() => setParams({}, { replace: true })}>
                          Clear filters
                        </Button>
                      ) : null
                    }
                  >
                    {filters.q
                      ? 'Try different words. Search looks at titles, descriptions and the full text of every note, document and saved page.'
                      : 'No items match these filters.'}
                  </EmptyState>
                </div>
              )}

              {data.items.length > 0 &&
                (view === 'grid' ? (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {data.items.map((r, i) => (
                      <ResourceCard key={r.id} resource={r} index={i} />
                    ))}
                  </div>
                ) : (
                  <ResourceList items={data.items} />
                ))}

              {data.hasMore && status !== 'loading' && (
                <div className="mt-6 flex justify-center">
                  <Button variant="secondary" loading={status === 'loadingMore'} onClick={() => load(data.page + 1)}>
                    Load more
                  </Button>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      <UploadDialog
        open={uploadOpen}
        initialFiles={droppedFiles}
        defaultCollectionId={defaultCollectionId}
        onClose={() => {
          setUploadOpen(false);
          setDroppedFiles(null);
          refreshTags();
        }}
        onUploaded={onAdded}
      />
      <LinkDialog open={linkOpen} onClose={() => setLinkOpen(false)} defaultCollectionId={defaultCollectionId} onSaved={onAdded} />
    </div>
  );
}
