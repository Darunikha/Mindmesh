import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Check, Crosshair, ExternalLink, Folder, Hash, Lightbulb, Link2, Maximize, RotateCcw, Search, SlidersHorizontal, Sparkles, Trash2, Waypoints, X } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader.jsx';
import Button from '../../components/ui/Button.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Dialog from '../../components/ui/Dialog.jsx';
import { TypeBadge } from '../../components/library/Badges.jsx';
import { TYPE_PLURALS } from '../../components/library/resourceMeta.js';
import { nodeTypes } from '../../components/graph/GraphNodes.jsx';
import { computeLayout } from '../../components/graph/layout.js';
import { graphApi } from '../../api/discovery.js';
import { useLibrary } from '../../context/LibraryContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const EDGE_STYLE = {
  manual: { stroke: 'var(--mm-accent)', strokeWidth: 2 },
  ai: { stroke: 'var(--mm-accent-2)', strokeWidth: 2, strokeDasharray: '6 4' },
  topic: { stroke: 'var(--mm-line-strong)', strokeWidth: 1 },
  collection: { stroke: 'var(--mm-accent-3)', strokeWidth: 1, strokeDasharray: '2 4' },
  nested: { stroke: 'var(--mm-accent-3)', strokeWidth: 1.5 },
};

function toFlow(graph) {
  const positions = computeLayout(graph.nodes, graph.edges);
  const nodes = graph.nodes.map((n) => ({ id: n.id, type: n.kind, position: positions.get(n.id), data: { ...n } }));
  const edges = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: 'c',
    targetHandle: 'c',
    type: 'straight',
    data: e,
    label: e.label || undefined,
    style: EDGE_STYLE[e.kind],
    selectable: Boolean(e.connectionId),
    labelBgPadding: [4, 2],
    labelBgBorderRadius: 4,
  }));
  return { nodes, edges };
}

function Chip({ active, onClick, children, title }) {
  return (
    <button type="button" className="mm-chip !py-1" aria-pressed={active} onClick={onClick} title={title}>
      {children}
    </button>
  );
}

function NodePanel({ node, edges, nodesById, onClose, onConnect, onRemoveConnection, onFilter, showSimilar }) {
  const [related, setRelated] = useState(null);
  const d = node.data;
  useEffect(() => {
    setRelated(null);
    if (d.kind !== 'resource') return;
    graphApi
      .related(d.resourceId)
      .then(setRelated)
      .catch(() => setRelated({ connected: [], similar: [] }));
  }, [d.kind, d.resourceId]);

  const neighbours = edges
    .filter((e) => e.source === node.id || e.target === node.id)
    .map((e) => ({ edge: e, other: nodesById.get(e.source === node.id ? e.target : e.source) }))
    .filter((x) => x.other);
  const topics = neighbours.filter((x) => x.other.data.kind === 'topic');
  const items = neighbours.filter((x) => x.other.data.kind === 'resource');
  const collections = neighbours.filter((x) => x.other.data.kind === 'collection');

  return (
    <aside className="mm-card flex max-h-full flex-col overflow-hidden" aria-label="Selected node">
      <div className="flex items-start gap-2 border-b border-line p-4">
        <div className="min-w-0 flex-1">
          {d.kind === 'resource' ? <TypeBadge type={d.resourceType} /> : <p className="mm-eyebrow">{d.kind === 'topic' ? 'Topic (tag)' : 'Collection'}</p>}
          <h2 className="mt-1 font-display text-lg leading-snug text-ink">{d.label}</h2>
        </div>
        <button type="button" onClick={onClose} className="rounded-control p-1 text-ink-faint hover:text-ink" aria-label="Close panel">
          <X size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {d.kind === 'resource' && (
          <Button to={`/vault/${d.resourceId}`} size="sm" icon={ExternalLink} className="w-full">
            Open {d.resourceType}
          </Button>
        )}
        {d.kind === 'topic' && (
          <div className="flex flex-col gap-2">
            <Button size="sm" variant="secondary" icon={Crosshair} onClick={() => onFilter({ tag: d.tagId })}>
              Show only this topic
            </Button>
            <Button size="sm" variant="ghost" to={`/vault?tags=${d.tagId}`}>
              Open in the vault
            </Button>
          </div>
        )}
        {d.kind === 'collection' && (
          <div className="flex flex-col gap-2">
            <Button size="sm" variant="secondary" icon={Crosshair} onClick={() => onFilter({ collection: d.collectionId })}>
              Show only this collection
            </Button>
            <Button size="sm" variant="ghost" to={`/vault?collection=${d.collectionId}`}>
              Open in the vault
            </Button>
          </div>
        )}

        {items.length > 0 && (
          <section>
            <p className="mm-eyebrow mb-2">{d.kind === 'resource' ? 'Connected items' : 'Items'}</p>
            <ul className="space-y-1">
              {items.map(({ edge, other }) => (
                <li key={edge.id} className="flex items-center gap-2">
                  <TypeBadge type={other.data.resourceType} withIcon={false} className="w-16 shrink-0" />
                  <Link to={`/vault/${other.data.resourceId}`} className="min-w-0 flex-1 truncate font-ui text-sm text-ink hover:text-accent">
                    {other.data.label}
                  </Link>
                  {edge.data?.connectionId && (
                    <button type="button" className="rounded p-1 text-ink-faint hover:text-danger" onClick={() => onRemoveConnection(edge.data.connectionId)} aria-label={`Remove connection to ${other.data.label}`}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        {topics.length > 0 && (
          <section>
            <p className="mm-eyebrow mb-2">Topics</p>
            <div className="flex flex-wrap gap-1.5">
              {topics.map(({ other }) => (
                <span key={other.id} className="mm-chip !py-0.5">
                  <Hash size={11} aria-hidden /> {other.data.label}
                </span>
              ))}
            </div>
          </section>
        )}
        {collections.length > 0 && d.kind !== 'collection' && (
          <p className="flex items-center gap-1.5 font-ui text-sm text-ink-muted">
            <Folder size={13} aria-hidden /> In {collections.map((c) => c.other.data.label).join(', ')}
          </p>
        )}

        {d.kind === 'resource' && showSimilar && (
          <section>
            <p className="mm-eyebrow mb-2">Related by content</p>
            {!related ? (
              <Skeleton lines={3} />
            ) : related.similar.length ? (
              <ul className="space-y-1.5">
                {related.similar.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <Link to={`/vault/${s.id}`} className="min-w-0 flex-1 truncate font-ui text-sm text-ink hover:text-accent">
                      {s.title}
                    </Link>
                    <span className="font-mono text-[0.65rem] text-ink-faint" title={`Similarity (${s.method})`}>
                      {Math.round(s.score * 100)}%
                    </span>
                    <button type="button" className="mm-btn mm-btn-ghost mm-btn-sm !h-7 !px-2" onClick={() => onConnect(d.resourceId, s.id)} aria-label={`Connect to ${s.title}`}>
                      <Link2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-ui text-xs text-ink-faint">No closely related items found yet.</p>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}

function EdgePanel({ edge, onClose, onSaveLabel, onRemove, nodesById }) {
  const [label, setLabel] = useState(edge.data.label || '');
  const a = nodesById.get(edge.source)?.data.label;
  const b = nodesById.get(edge.target)?.data.label;
  return (
    <aside className="mm-card p-4" aria-label="Selected connection">
      <div className="mb-3 flex items-start justify-between">
        <p className="mm-eyebrow">{edge.data.kind === 'ai' ? 'Accepted suggestion' : 'Your connection'}</p>
        <button type="button" onClick={onClose} className="rounded-control p-1 text-ink-faint hover:text-ink" aria-label="Close panel">
          <X size={16} />
        </button>
      </div>
      <p className="font-ui text-sm text-ink">
        <strong>{a}</strong> ↔ <strong>{b}</strong>
      </p>
      {edge.data.reason && <p className="mt-2 font-ui text-xs text-ink-muted">{edge.data.reason}</p>}
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSaveLabel(edge.data.connectionId, label.trim());
        }}
      >
        <label htmlFor="edge-label" className="sr-only">
          Label
        </label>
        <input id="edge-label" className="mm-input !min-h-9 !py-1 text-sm" placeholder="Label, e.g. “explains”" maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} />
        <Button type="submit" size="sm" variant="secondary" iconOnly icon={Check} aria-label="Save label" />
      </form>
      <Button variant="danger-ghost" size="sm" icon={Trash2} className="mt-3 w-full" onClick={() => onRemove(edge.data.connectionId)}>
        Remove connection
      </Button>
    </aside>
  );
}

function SuggestionsPanel({ suggestions, generating, onGenerate, onAccept, onDismiss, onClose }) {
  return (
    <aside className="mm-card flex max-h-full flex-col overflow-hidden" aria-label="Suggested connections">
      <div className="flex items-start gap-2 border-b border-line p-4">
        <div className="flex-1">
          <p className="mm-eyebrow">Suggested connections</p>
          <p className="mt-1 font-ui text-xs text-ink-muted">Proposed from similar content. Nothing is added to your graph until you accept it.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-control p-1 text-ink-faint hover:text-ink" aria-label="Close panel">
          <X size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <Button size="sm" icon={Sparkles} loading={generating} onClick={onGenerate} className="mb-4 w-full">
          Find new suggestions
        </Button>
        {suggestions === null ? (
          <Skeleton lines={4} />
        ) : suggestions.length === 0 ? (
          <p className="font-ui text-sm text-ink-faint">No pending suggestions.</p>
        ) : (
          <ul className="space-y-3">
            {suggestions.map((s) => (
              <li key={s.id} className="rounded-card border border-line p-3">
                <p className="font-ui text-sm text-ink">
                  <Link to={`/vault/${s.sourceId}`} className="font-semibold hover:text-accent">
                    {s.sourceTitle}
                  </Link>
                  <span className="mx-1 text-ink-faint">↔</span>
                  <Link to={`/vault/${s.targetId}`} className="font-semibold hover:text-accent">
                    {s.targetTitle}
                  </Link>
                </p>
                <p className="mt-1 font-ui text-xs text-ink-muted">
                  <span className="font-semibold text-accent-2">{s.label}</span> · {s.reason}
                </p>
                <p className="mt-1 font-mono text-[0.62rem] text-ink-faint">
                  {s.method} · score {s.score}
                </p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" icon={Check} onClick={() => onAccept(s)}>
                    Accept
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDismiss(s)}>
                    Dismiss
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function GraphCanvas() {
  const { theme } = useTheme();
  const toast = useToast();
  const navigate = useNavigate();
  const { flatCollections, tags: allTags } = useLibrary();
  const { setCenter, fitView } = useReactFlow();
  const { user } = useAuth();
  const suggestionsOn = user.preferences?.library?.suggestConnections !== false;
  const [sp, setSp] = useSearchParams();

  const filters = {
    types: (sp.get('types') || 'note,document,link').split(',').filter(Boolean),
    showTopics: sp.get('topics') !== '0',
    showCollections: sp.get('collections') !== '0',
    collection: sp.get('collection') || '',
    tag: sp.get('tag') || '',
  };
  const setFilter = (patch) =>
    setSp(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === '' || v === null || v === undefined) next.delete(k);
          else next.set(k, String(v));
        }
        return next;
      },
      { replace: true }
    );

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [selection, setSelection] = useState(null); // { kind: 'node'|'edge', id }
  const [panel, setPanel] = useState(null); // 'suggestions' | null
  const [suggestions, setSuggestions] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [query, setQuery] = useState('');
  const [focusNeighbours, setFocusNeighbours] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const pendingPositions = useRef({});
  const saveTimer = useRef(null);

  const filterKey = sp.toString();
  const load = useCallback(async () => {
    setStatus((s) => (s === 'ready' ? 'refreshing' : 'loading'));
    try {
      const g = await graphApi.get({
        types: filters.types,
        showTopics: String(filters.showTopics),
        showCollections: String(filters.showCollections),
        collection: filters.collection,
        tag: filters.tag,
      });
      const flow = toFlow(g);
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setMeta({ truncated: g.truncated, total: g.total, shown: g.shown });
      setStatus('ready');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, setNodes, setEdges]);

  useEffect(() => {
    load();
  }, [load]);

  const loadSuggestions = useCallback(() => graphApi.suggestions().then((d) => setSuggestions(d.suggestions)).catch(() => setSuggestions([])), []);
  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  const nodesById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // Search + neighbour focus are presentation only; they don't change stored positions.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? nodes.filter((n) => n.data.label.toLowerCase().includes(q)) : [];
  }, [nodes, query]);

  const display = useMemo(() => {
    const matchSet = new Set(matches.map((m) => m.id));
    let keep = null;
    if (selection?.kind === 'node' && focusNeighbours) {
      keep = new Set([selection.id]);
      edges.forEach((e) => {
        if (e.source === selection.id) keep.add(e.target);
        if (e.target === selection.id) keep.add(e.source);
      });
    }
    return {
      nodes: nodes.map((n) => {
        const dim = (keep && !keep.has(n.id)) || (query.trim() && !matchSet.has(n.id));
        const match = matchSet.has(n.id);
        return dim === Boolean(n.data.dim) && match === Boolean(n.data.match) ? n : { ...n, data: { ...n.data, dim, match } };
      }),
      edges: keep ? edges.map((e) => (keep.has(e.source) && keep.has(e.target) ? e : { ...e, style: { ...e.style, opacity: 0.12 } })) : edges,
    };
  }, [nodes, edges, matches, selection, focusNeighbours, query]);

  const onNodeDragStop = useCallback((_e, _node, dragged) => {
    for (const n of dragged) pendingPositions.current[n.id] = n.position;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const positions = pendingPositions.current;
      pendingPositions.current = {};
      graphApi.saveLayout(positions).catch(() => {});
    }, 600);
  }, []);

  const connect = useCallback(
    async (sourceId, targetId) => {
      try {
        const { connection } = await graphApi.createConnection({ sourceId, targetId });
        setEdges((es) => [
          ...es,
          { id: `x:${connection.id}`, source: `r:${connection.sourceId}`, target: `r:${connection.targetId}`, sourceHandle: 'c', targetHandle: 'c', type: 'straight', data: { kind: 'manual', connectionId: connection.id }, style: EDGE_STYLE.manual, selectable: true },
        ]);
        toast.success('Connected');
      } catch (err) {
        toast.error(err.message);
      }
    },
    [setEdges, toast]
  );

  const removeConnection = async (connectionId) => {
    setConfirmRemove(null);
    try {
      await graphApi.deleteConnection(connectionId);
      setEdges((es) => es.filter((e) => e.data?.connectionId !== connectionId));
      if (selection?.kind === 'edge') setSelection(null);
      toast.success('Connection removed');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const saveLabel = async (connectionId, label) => {
    try {
      await graphApi.updateConnection(connectionId, { label });
      setEdges((es) => es.map((e) => (e.data?.connectionId === connectionId ? { ...e, label: label || undefined, data: { ...e.data, label } } : e)));
      toast.success('Label saved');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await graphApi.generate();
      await loadSuggestions();
      if (res.message) toast.info(res.message);
      else toast.success(res.created.length ? `Found ${res.created.length} new suggestion${res.created.length === 1 ? '' : 's'}` : 'No new connections stood out. Your existing links already cover the strongest matches.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const decide = async (s, accept) => {
    try {
      await (accept ? graphApi.accept(s.id) : graphApi.dismiss(s.id));
      setSuggestions((list) => list.filter((x) => x.id !== s.id));
      if (accept) {
        toast.success('Connection added');
        load();
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const goTo = (n) => {
    setSelection({ kind: 'node', id: n.id });
    setCenter(n.position.x + 80, n.position.y + 20, { zoom: 1.1, duration: 500 });
    setQuery('');
  };

  const resetLayout = async () => {
    setConfirmReset(false);
    await graphApi.resetLayout().catch(() => {});
    await load();
    setTimeout(() => fitView({ duration: 400 }), 50);
  };

  const selectedNode = selection?.kind === 'node' ? nodesById.get(selection.id) : null;
  const selectedEdge = selection?.kind === 'edge' ? edges.find((e) => e.id === selection.id) : null;
  const resourceCount = nodes.filter((n) => n.data.kind === 'resource').length;

  return (
    <div className="flex h-[calc(100dvh-9rem)] min-h-[520px] flex-col gap-3 lg:h-[calc(100dvh-6rem)]">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint" aria-hidden />
          <label htmlFor="graph-search" className="sr-only">
            Find a node
          </label>
          <input id="graph-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a node…" className="mm-input !min-h-9 !py-1 !pl-8 text-sm" autoComplete="off" />
          {matches.length > 0 && (
            <ul className="mm-card absolute z-20 mt-1 max-h-64 w-full overflow-y-auto p-1 shadow-raised" role="listbox">
              {matches.slice(0, 10).map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => goTo(n)} className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left font-ui text-sm text-ink-muted hover:bg-sunken hover:text-ink">
                    {n.data.kind === 'resource' ? <TypeBadge type={n.data.resourceType} withIcon={false} className="w-14 shrink-0" /> : n.data.kind === 'topic' ? <Hash size={12} /> : <Folder size={12} />}
                    <span className="truncate">{n.data.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button variant={filtersOpen ? 'secondary' : 'ghost'} size="sm" icon={SlidersHorizontal} className="sm:hidden" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}>
          Filters
        </Button>
        {/* On small screens the filters collapse so the canvas keeps most of the space. */}
        <div className={`${filtersOpen ? 'flex' : 'hidden'} w-full flex-wrap items-center gap-2 sm:flex sm:w-auto`}>
        {['note', 'document', 'link'].map((t) => (
          <Chip
            key={t}
            active={filters.types.includes(t)}
            onClick={() => {
              const next = filters.types.includes(t) ? filters.types.filter((x) => x !== t) : [...filters.types, t];
              if (next.length) setFilter({ types: next.length === 3 ? '' : next.join(',') });
            }}
          >
            {TYPE_PLURALS[theme][t]}
          </Chip>
        ))}
        <Chip active={filters.showTopics} onClick={() => setFilter({ topics: filters.showTopics ? '0' : '' })} title="Show tags as topic nodes">
          <Hash size={11} aria-hidden /> Topics
        </Chip>
        <Chip active={filters.showCollections} onClick={() => setFilter({ collections: filters.showCollections ? '0' : '' })}>
          <Folder size={11} aria-hidden /> Collections
        </Chip>
        <select aria-label="Filter by collection" className="mm-input !min-h-9 !w-auto !py-1 text-sm" value={filters.collection} onChange={(e) => setFilter({ collection: e.target.value })}>
          <option value="">All collections</option>
          <option value="none">Unfiled</option>
          {flatCollections.map((c) => (
            <option key={c.id} value={c.id}>{`${'  '.repeat(c.depth)}${c.name}`}</option>
          ))}
        </select>
        <select aria-label="Filter by topic" className="mm-input !min-h-9 !w-auto !py-1 text-sm" value={filters.tag} onChange={(e) => setFilter({ tag: e.target.value })}>
          <option value="">All topics</option>
          {(allTags || []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button variant={focusNeighbours ? 'secondary' : 'ghost'} size="sm" icon={Crosshair} onClick={() => setFocusNeighbours((f) => !f)} aria-pressed={focusNeighbours} title="Fade everything except the selected node's neighbours">
            Focus
          </Button>
          {suggestionsOn && (
          <Button variant={panel === 'suggestions' ? 'secondary' : 'ghost'} size="sm" icon={Lightbulb} onClick={() => setPanel((p) => (p === 'suggestions' ? null : 'suggestions'))}>
            Suggestions{suggestions?.length ? ` (${suggestions.length})` : ''}
          </Button>
          )}
          <Button variant="ghost" size="sm" iconOnly icon={Maximize} aria-label="Fit to screen" title="Fit to screen" onClick={() => fitView({ duration: 400 })} />
          <Button variant="ghost" size="sm" iconOnly icon={RotateCcw} aria-label="Reset layout" title="Reset layout" onClick={() => setConfirmReset(true)} />
        </div>
      </div>

      {meta?.truncated && (
        <Alert tone="info">
          Showing {meta.shown} of {meta.total} items (pinned and recently opened first). Use the filters to focus the graph.
        </Alert>
      )}
      {status === 'error' && <Alert tone="error">{error}</Alert>}

      <div className="relative grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="mm-graph mm-card relative min-h-[400px] overflow-hidden">
          {status === 'loading' ? (
            <div className="p-6">
              <Skeleton className="h-[50vh]" />
            </div>
          ) : resourceCount === 0 ? (
            <EmptyState
              icon={Waypoints}
              title="Your graph is empty"
              className="h-full justify-center"
              action={
                <Button to="/vault" icon={ExternalLink}>
                  Go to the vault
                </Button>
              }
            >
              {filters.collection || filters.tag || filters.types.length < 3 ? 'Nothing matches these filters.' : 'Add notes, documents or links, then tag them or connect them to see your knowledge take shape.'}
            </EmptyState>
          ) : (
            <ReactFlow
              nodes={display.nodes}
              edges={display.edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeDragStop={onNodeDragStop}
              onNodeClick={(_e, n) => setSelection({ kind: 'node', id: n.id })}
              onNodeDoubleClick={(_e, n) => {
                if (n.data.kind === 'resource') navigate(`/vault/${n.data.resourceId}`);
                else if (n.data.kind === 'topic') setFilter({ tag: n.data.tagId });
                else setFilter({ collection: n.data.collectionId });
              }}
              onEdgeClick={(_e, e) => e.data?.connectionId && setSelection({ kind: 'edge', id: e.id })}
              onPaneClick={() => setSelection(null)}
              onConnect={({ source, target }) => connect(source.slice(2), target.slice(2))}
              isValidConnection={(c) => c.source !== c.target && c.source.startsWith('r:') && c.target.startsWith('r:')}
              deleteKeyCode={null}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.15}
              maxZoom={2.5}
              proOptions={{ hideAttribution: true }}
            >
              <Background
                variant={theme === 'lab' ? BackgroundVariant.Lines : BackgroundVariant.Dots}
                gap={theme === 'lab' ? 40 : 22}
                size={theme === 'lab' ? 1 : 1.5}
                color={theme === 'lab' ? 'rgba(149,161,186,0.08)' : 'var(--mm-line-strong)'}
              />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable nodeStrokeWidth={2} className="!hidden sm:!block" />
            </ReactFlow>
          )}
          {status === 'ready' && resourceCount > 0 && (
            <p className="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 rounded-pill bg-surface/90 px-3 py-1 font-ui text-[0.7rem] text-ink-faint shadow-card md:block">
              Click to explore · double-click to open · drag from an item’s edge to another item to connect them
            </p>
          )}
        </div>

        {(selectedNode || selectedEdge || (panel === 'suggestions' && suggestionsOn)) && (
          <div className="absolute inset-x-2 bottom-2 z-10 max-h-[60%] min-h-0 lg:static lg:inset-auto lg:max-h-none lg:w-80">
            {panel === 'suggestions' ? (
              <SuggestionsPanel suggestions={suggestions} generating={generating} onGenerate={generate} onAccept={(s) => decide(s, true)} onDismiss={(s) => decide(s, false)} onClose={() => setPanel(null)} />
            ) : selectedNode ? (
              <NodePanel
                key={selectedNode.id}
                node={selectedNode}
                edges={edges}
                nodesById={nodesById}
                onClose={() => setSelection(null)}
                onConnect={connect}
                onRemoveConnection={setConfirmRemove}
                showSimilar={suggestionsOn}
                onFilter={(f) => {
                  setSelection(null);
                  setFilter(f);
                }}
              />
            ) : (
              <EdgePanel key={selectedEdge.id} edge={selectedEdge} nodesById={nodesById} onClose={() => setSelection(null)} onSaveLabel={saveLabel} onRemove={setConfirmRemove} />
            )}
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(confirmRemove)}
        onClose={() => setConfirmRemove(null)}
        tone="danger"
        title="Remove this connection?"
        description="The two items stay in your library; only the link between them is removed."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRemove(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => removeConnection(confirmRemove)}>
              Remove
            </Button>
          </>
        }
      />
      <Dialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset the layout?"
        description="Positions you have arranged by dragging will be forgotten and the graph will be laid out automatically."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button onClick={resetLayout}>Reset</Button>
          </>
        }
      />
    </div>
  );
}

export default function GraphPage() {
  const { theme } = useTheme();
  return (
    <>
      <PageHeader className="!mb-4" eyebrow={theme === 'library' ? 'The Archive' : theme === 'lab' ? '03 / Analysis · graph' : 'Discover'} title="Knowledge Graph" />
      <ReactFlowProvider>
        <GraphCanvas />
      </ReactFlowProvider>
    </>
  );
}
