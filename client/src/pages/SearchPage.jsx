import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Clock, Folder, History, Info, Search, SearchX, SlidersHorizontal, Sparkles, Tag as TagIcon, X } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader.jsx';
import Button from '../components/ui/Button.jsx';
import Alert from '../components/ui/Alert.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Highlight from '../components/discovery/Highlight.jsx';
import { TypeBadge } from '../components/library/Badges.jsx';
import { TYPE_PLURALS } from '../components/library/resourceMeta.js';
import { searchApi } from '../api/discovery.js';
import { useLibrary } from '../context/LibraryContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useDebouncedValue } from '../hooks/useProcessingPoll.js';
import { formatDate, relativeTime } from '../lib/format.js';
import { cn } from '../lib/cn.js';

const MODES = [
  { value: 'smart', label: 'Smart', hint: 'Exact words and meaning, combined' },
  { value: 'keyword', label: 'Exact words', hint: 'Titles and full text containing your words' },
  { value: 'semantic', label: 'Meaning', hint: 'Related ideas, even with different wording' },
];
const DATE_PRESETS = [
  { value: '', label: 'Any time' },
  { value: '7', label: 'Past week' },
  { value: '30', label: 'Past month' },
  { value: '365', label: 'Past year' },
  { value: 'custom', label: 'Custom range' },
];
const EXAMPLES = ['how computers learn from examples', 'summary of my reading on history', 'code snippets about sorting'];
const PAGE = 20;
const iso = (d) => d.toISOString().slice(0, 10);

function readParams(sp) {
  return {
    q: sp.get('q') || '',
    mode: sp.get('mode') || 'smart',
    type: (sp.get('type') || '').split(',').filter(Boolean),
    collection: sp.get('collection') || '',
    tags: (sp.get('tags') || '').split(',').filter(Boolean),
    preset: sp.get('preset') || '',
    from: sp.get('from') || '',
    to: sp.get('to') || '',
    sort: sp.get('sort') || 'relevance',
  };
}

function MatchBadges({ item }) {
  const { theme } = useTheme();
  const labels = { title: 'Title', keyword: 'Exact words', semantic: 'Related meaning' };
  return (
    <span className="flex flex-wrap gap-1">
      {item.matchedBy.map((m) => (
        <span
          key={m}
          className={cn(
            'rounded-pill border px-1.5 py-px font-ui text-[0.66rem] font-semibold lab:font-mono lab:uppercase lab:tracking-wider',
            m === 'semantic' ? 'border-accent-2/40 text-accent-2' : 'border-line-strong text-ink-muted'
          )}
          title={m === 'semantic' && item.similarity != null ? `Similarity ${item.similarity}` : undefined}
        >
          {m === 'semantic' && <Sparkles size={9} className="mr-0.5 inline" aria-hidden />}
          {labels[m]}
          {m === 'semantic' && item.similarity != null && theme === 'lab' ? ` ${Math.round(item.similarity * 100)}%` : ''}
        </span>
      ))}
    </span>
  );
}

function ResultCard({ item }) {
  const { collectionById } = useLibrary();
  const r = item.resource;
  const collection = r.collectionId ? collectionById.get(r.collectionId) : null;
  return (
    <li className="mm-card mm-card-interactive mm-card-ruled">
      <Link to={`/vault/${r.id}`} className="block p-4 sm:p-5">
        <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <TypeBadge type={r.type} />
          <MatchBadges item={item} />
          <span className="ml-auto font-ui text-[0.72rem] text-ink-faint lab:font-mono">{formatDate(r.createdAt)}</span>
        </div>
        <h3 className="font-display text-lg leading-snug text-ink library:text-xl">
          <Highlight text={r.title} ranges={item.titleHighlights} />
        </h3>
        {r.type === 'link' && r.link?.domain && <p className="font-mono text-[0.7rem] text-ink-faint">{r.link.domain}</p>}
        {item.passages.map((p, i) => (
          <div key={i} className="mt-2 border-l-2 border-line pl-3">
            {(p.page || p.heading) && (
              <p className="mb-0.5 font-mono text-[0.66rem] tracking-wide text-ink-faint uppercase">
                {p.page ? `Page ${p.page}${p.pageEnd && p.pageEnd !== p.page ? `–${p.pageEnd}` : ''}` : ''}
                {p.page && p.heading ? ' · ' : ''}
                {p.heading ? `§ ${p.heading}` : ''}
              </p>
            )}
            <p className="font-body text-[0.9rem] leading-relaxed text-ink-muted">
              <Highlight text={p.text} ranges={p.highlights} />
            </p>
          </div>
        ))}
        {(r.tags.length > 0 || collection) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {collection && (
              <span className="inline-flex items-center gap-1 font-ui text-[0.72rem] text-ink-faint">
                <Folder size={11} aria-hidden /> {collection.name}
              </span>
            )}
            {r.tags.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1 rounded-pill bg-sunken px-2 py-0.5 font-ui text-[0.7rem] text-ink-muted">
                <TagIcon size={10} aria-hidden />
                {t.name}
              </span>
            ))}
          </div>
        )}
      </Link>
    </li>
  );
}

export default function SearchPage() {
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { flatCollections, tags } = useLibrary();
  const params = readParams(sp);

  const [draft, setDraft] = useState(params.q);
  const debounced = useDebouncedValue(draft, 350);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [recent, setRecent] = useState(null);
  const [suggest, setSuggest] = useState(null);
  const [focused, setFocused] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [showFilters, setShowFilters] = useState(false);
  const req = useRef(0);
  const recordTimer = useRef(null);

  const update = useCallback(
    (patch) =>
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length)) next.delete(k);
            else next.set(k, Array.isArray(v) ? v.join(',') : v);
          }
          return next;
        },
        { replace: true }
      ),
    [setSp]
  );

  useEffect(() => {
    if (debounced.trim() !== params.q) update({ q: debounced.trim() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const loadRecent = useCallback(() => searchApi.recent().then((d) => setRecent(d.searches)).catch(() => setRecent([])), []);
  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  const dateRange = useMemo(() => {
    if (params.preset && params.preset !== 'custom') {
      const d = new Date();
      d.setDate(d.getDate() - Number(params.preset));
      return { from: iso(d), to: '' };
    }
    if (params.preset === 'custom') return { from: params.from, to: params.to };
    return { from: '', to: '' };
  }, [params.preset, params.from, params.to]);

  const queryKey = JSON.stringify({ ...params, ...dateRange });

  const run = useCallback(
    async (page = 1, record = false) => {
      if (!params.q) {
        setData(null);
        setStatus('idle');
        return;
      }
      const id = ++req.current;
      setStatus(page === 1 ? 'loading' : 'more');
      setError(null);
      try {
        const res = await searchApi.search({
          q: params.q,
          mode: params.mode,
          type: params.type,
          collection: params.collection,
          tags: params.tags,
          from: dateRange.from,
          to: dateRange.to,
          sort: params.sort,
          page,
          limit: PAGE,
          record: record ? 'true' : undefined,
        });
        if (id !== req.current) return;
        setData((prev) => (page === 1 ? res : { ...res, items: [...prev.items, ...res.items] }));
        setStatus('ready');
        if (record) loadRecent();
      } catch (err) {
        if (id !== req.current) return;
        setError(err.message);
        setStatus('error');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryKey, loadRecent]
  );

  useEffect(() => {
    run(1);
    // Remember a query once the user has paused on it for a moment.
    clearTimeout(recordTimer.current);
    if (params.q.length >= 2) recordTimer.current = setTimeout(() => searchApi.search({ q: params.q, limit: 1, record: 'true', mode: 'keyword' }).then(loadRecent).catch(() => {}), 2500);
    return () => clearTimeout(recordTimer.current);
  }, [run, params.q, loadRecent]);

  // Type-ahead suggestions.
  const suggestQuery = useDebouncedValue(draft.trim(), 180);
  useEffect(() => {
    if (!suggestQuery) return setSuggest(null);
    const controller = new AbortController();
    searchApi
      .suggest(suggestQuery, { signal: controller.signal })
      .then(setSuggest)
      .catch(() => {});
    return () => controller.abort();
  }, [suggestQuery]);

  const submit = (q) => {
    clearTimeout(recordTimer.current);
    setDraft(q);
    update({ q });
    setFocused(false);
    if (q.trim()) searchApi.search({ q, limit: 1, record: 'true', mode: 'keyword' }).then(loadRecent).catch(() => {});
  };

  const dropdownItems = useMemo(() => {
    if (!draft.trim()) return (recent || []).slice(0, 6).map((r) => ({ kind: 'recent', label: r.query, id: r.id }));
    if (!suggest) return [];
    return [
      ...suggest.recent.map((q) => ({ kind: 'recent', label: q })),
      ...suggest.resources.map((r) => ({ kind: 'resource', label: r.title, id: r.id, type: r.type })),
      ...suggest.tags.map((t) => ({ kind: 'tag', label: t.name, id: t.id })),
      ...suggest.collections.map((c) => ({ kind: 'collection', label: c.name, id: c.id })),
    ].slice(0, 10);
  }, [draft, suggest, recent]);

  const pick = (item) => {
    if (item.kind === 'resource') return navigate(`/vault/${item.id}`);
    if (item.kind === 'tag') {
      update({ tags: [...new Set([...params.tags, item.id])] });
      setFocused(false);
      return undefined;
    }
    if (item.kind === 'collection') {
      update({ collection: item.id });
      setFocused(false);
      return undefined;
    }
    return submit(item.label);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, dropdownItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && dropdownItems[activeIdx]) pick(dropdownItems[activeIdx]);
      else submit(draft.trim());
    } else if (e.key === 'Escape') {
      setFocused(false);
    }
  };

  const filterCount = params.type.length + (params.collection ? 1 : 0) + params.tags.length + (params.preset ? 1 : 0);
  const showDropdown = focused && dropdownItems.length > 0;

  return (
    <>
      <PageHeader eyebrow={theme === 'library' ? 'The Card Catalogue' : theme === 'lab' ? '02 / Data · query' : 'Discover'} title="Smart Search" description="Search everything you’ve saved by exact words or by meaning." />

      {/* Search box */}
      <div className="relative">
        <Search size={20} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-faint" aria-hidden />
        <label htmlFor="smart-search" className="sr-only">
          Search your knowledge
        </label>
        <input
          id="smart-search"
          type="search"
          autoFocus
          autoComplete="off"
          value={draft}
          maxLength={200}
          onChange={(e) => {
            setDraft(e.target.value);
            setActiveIdx(-1);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={onKeyDown}
          placeholder={theme === 'lab' ? 'query your knowledge base…' : 'Search by words or ideas, e.g. “how computers learn from examples”'}
          className="mm-input !min-h-[3.5rem] !rounded-panel !pr-12 !pl-12 text-[1.05rem] shadow-card library:font-body library:text-lg"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="search-suggestions"
          aria-autocomplete="list"
        />
        {draft && (
          <button type="button" onClick={() => submit('')} className="absolute top-1/2 right-4 -translate-y-1/2 rounded-control p-1 text-ink-faint hover:text-ink" aria-label="Clear search">
            <X size={16} />
          </button>
        )}
        {showDropdown && (
          <ul id="search-suggestions" role="listbox" className="mm-card absolute z-30 mt-2 w-full overflow-hidden p-1 shadow-raised">
            {!draft.trim() && <li className="mm-eyebrow px-3 pt-2 pb-1">Recent searches</li>}
            {dropdownItems.map((it, i) => {
              const Icon = { recent: History, resource: Search, tag: TagIcon, collection: Folder }[it.kind];
              return (
                <li
                  key={`${it.kind}-${it.id || it.label}`}
                  role="option"
                  aria-selected={i === activeIdx}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(it);
                  }}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={cn('flex cursor-pointer items-center gap-2.5 rounded-control px-3 py-2 font-ui text-sm', i === activeIdx ? 'bg-accent-soft text-ink' : 'text-ink-muted')}
                >
                  <Icon size={14} className="shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  {it.kind === 'resource' && <TypeBadge type={it.type} withIcon={false} />}
                  {it.kind === 'tag' && <span className="text-xs text-ink-faint">filter by tag</span>}
                  {it.kind === 'collection' && <span className="text-xs text-ink-faint">filter by collection</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Mode + filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Search mode" className="inline-flex rounded-pill border border-line bg-surface-2 p-0.5">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={params.mode === m.value}
              title={m.hint}
              onClick={() => update({ mode: m.value === 'smart' ? '' : m.value })}
              className={cn('rounded-pill px-3 py-1.5 font-ui text-xs font-semibold lab:font-mono lab:uppercase lab:tracking-wider', params.mode === m.value ? 'bg-accent text-accent-ink' : 'text-ink-muted hover:text-ink')}
            >
              {m.label}
            </button>
          ))}
        </div>
        <Button variant={showFilters || filterCount ? 'secondary' : 'ghost'} size="sm" icon={SlidersHorizontal} onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
          Filters{filterCount ? ` (${filterCount})` : ''}
        </Button>
        <label htmlFor="search-sort" className="sr-only">
          Sort
        </label>
        <select id="search-sort" className="mm-input !min-h-9 !w-auto !py-1 text-sm sm:ml-auto" value={params.sort} onChange={(e) => update({ sort: e.target.value === 'relevance' ? '' : e.target.value })}>
          <option value="relevance">Best match</option>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      {showFilters && (
        <div className="mm-card mt-3 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <fieldset>
            <legend className="mm-label">Type</legend>
            <div className="flex flex-wrap gap-1.5">
              {['note', 'document', 'link'].map((t) => (
                <button
                  key={t}
                  type="button"
                  className="mm-chip"
                  aria-pressed={params.type.includes(t)}
                  onClick={() => update({ type: params.type.includes(t) ? params.type.filter((x) => x !== t) : [...params.type, t] })}
                >
                  {TYPE_PLURALS[theme][t]}
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="f-collection" className="mm-label">
              Collection
            </label>
            <select id="f-collection" className="mm-input" value={params.collection} onChange={(e) => update({ collection: e.target.value })}>
              <option value="">All collections</option>
              <option value="none">Unfiled only</option>
              {flatCollections.map((c) => (
                <option key={c.id} value={c.id}>{`${'  '.repeat(c.depth)}${c.name}`}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-date" className="mm-label">
              Date added
            </label>
            <select id="f-date" className="mm-input" value={params.preset} onChange={(e) => update({ preset: e.target.value, from: '', to: '' })}>
              {DATE_PRESETS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
            {params.preset === 'custom' && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input type="date" aria-label="From date" className="mm-input !min-h-9 !py-1 text-sm" value={params.from} max={params.to || undefined} onChange={(e) => update({ from: e.target.value })} />
                <input type="date" aria-label="To date" className="mm-input !min-h-9 !py-1 text-sm" value={params.to} min={params.from || undefined} onChange={(e) => update({ to: e.target.value })} />
              </div>
            )}
          </div>
          <fieldset>
            <legend className="mm-label">Tags</legend>
            {tags?.length ? (
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                {tags.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="mm-chip !py-0.5"
                    aria-pressed={params.tags.includes(t.id)}
                    onClick={() => update({ tags: params.tags.includes(t.id) ? params.tags.filter((x) => x !== t.id) : [...params.tags, t.id] })}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="font-ui text-xs text-ink-faint">No tags yet.</p>
            )}
          </fieldset>
          {filterCount > 0 && (
            <div className="sm:col-span-2 lg:col-span-4">
              <button type="button" className="font-ui text-xs text-ink-muted underline-offset-2 hover:underline" onClick={() => update({ type: [], collection: '', tags: [], preset: '', from: '', to: '' })}>
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      <section className="mt-6" aria-busy={status === 'loading'} aria-label="Search results">
        {!params.q && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="mm-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="mm-eyebrow">Recent searches</p>
                {recent?.length > 0 && (
                  <button type="button" className="font-ui text-xs text-ink-faint hover:text-ink" onClick={() => searchApi.clearRecent().then(loadRecent)}>
                    Clear all
                  </button>
                )}
              </div>
              {recent === null ? (
                <Skeleton lines={3} />
              ) : recent.length ? (
                <ul className="space-y-0.5">
                  {recent.map((r) => (
                    <li key={r.id} className="group flex items-center gap-2 rounded-control px-2 py-1.5 hover:bg-sunken">
                      <Clock size={13} className="text-ink-faint" aria-hidden />
                      <button type="button" onClick={() => submit(r.query)} className="min-w-0 flex-1 truncate text-left font-ui text-sm text-ink">
                        {r.query}
                      </button>
                      <span className="font-ui text-[0.7rem] text-ink-faint">{relativeTime(r.lastSearchedAt)}</span>
                      <button type="button" className="rounded p-0.5 text-ink-faint opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-ink" onClick={() => searchApi.deleteRecent(r.id).then(loadRecent)} aria-label={`Remove ${r.query}`}>
                        <X size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="font-ui text-sm text-ink-faint">Searches you make are remembered here.</p>
              )}
            </div>
            <div className="mm-card p-5">
              <p className="mm-eyebrow mb-3">Try searching by meaning</p>
              <div className="flex flex-col items-start gap-2">
                {EXAMPLES.map((e) => (
                  <button key={e} type="button" className="mm-chip text-left" onClick={() => submit(e)}>
                    <Sparkles size={12} aria-hidden /> {e}
                  </button>
                ))}
              </div>
              <p className="mt-4 font-ui text-xs text-ink-faint">Smart mode finds related ideas even when your exact words don’t appear.</p>
            </div>
          </div>
        )}

        {params.q && data?.semantic?.reason && (
          <Alert tone="info" className="mb-4">
            {data.semantic.reason}
          </Alert>
        )}

        {params.q && status === 'loading' && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        )}
        {status === 'error' && <Alert tone="error">{error}</Alert>}

        {params.q && status !== 'loading' && data && (
          <>
            <p className="mb-3 font-ui text-sm text-ink-muted lab:font-mono lab:text-xs" aria-live="polite">
              {data.total} {data.total === 1 ? 'result' : 'results'} for “{params.q}”
              {data.semantic?.used ? ' · includes related meanings' : ''}
            </p>
            {data.items.length === 0 ? (
              <div className="mm-card">
                <EmptyState icon={SearchX} title="Nothing found" action={filterCount ? <Button variant="secondary" size="sm" onClick={() => update({ type: [], collection: '', tags: [], preset: '' })}>Clear filters</Button> : null}>
                  {params.mode === 'keyword' ? 'No item contains these words. Try Smart mode to include related ideas.' : 'Try different wording, fewer filters, or a broader idea.'}
                </EmptyState>
              </div>
            ) : (
              <ul className="space-y-3">
                {data.items.map((it) => (
                  <ResultCard key={it.resource.id} item={it} />
                ))}
              </ul>
            )}
            {data.hasMore && (
              <div className="mt-5 flex justify-center">
                <Button variant="secondary" loading={status === 'more'} onClick={() => run(data.page + 1)}>
                  More results
                </Button>
              </div>
            )}
            {data.items.length > 0 && (
              <p className="mt-4 flex items-center gap-1.5 font-ui text-xs text-ink-faint">
                <Info size={12} aria-hidden /> Each item appears once. Highlighted words matched your query, and “Related meaning” results were found semantically.
              </p>
            )}
          </>
        )}
      </section>
    </>
  );
}
