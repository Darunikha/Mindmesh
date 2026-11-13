import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { GraduationCap, Layers, Pause, Pencil, Play, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader.jsx';
import Button from '../components/ui/Button.jsx';
import Alert from '../components/ui/Alert.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Dialog from '../components/ui/Dialog.jsx';
import ReviewSession from '../components/flashcards/ReviewSession.jsx';
import CardDialog from '../components/flashcards/CardDialog.jsx';
import { flashcardsApi } from '../api/chat.js';
import { useTheme } from '../context/ThemeContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDebouncedValue } from '../hooks/useProcessingPoll.js';
import { relativeTime } from '../lib/format.js';
import { cn } from '../lib/cn.js';

function Stat({ label, value }) {
  return (
    <div className="mm-card min-w-0 p-4">
      <p className="mm-eyebrow">{label}</p>
      <p className="mt-1 font-display text-3xl text-ink lab:font-mono lab:text-2xl">{value ?? '–'}</p>
    </div>
  );
}

function dueLabel(card) {
  if (card.suspended) return 'Suspended';
  if (card.isNew) return 'New';
  const ms = new Date(card.dueAt) - Date.now();
  return ms <= 0 ? 'Due now' : `Due ${relativeTime(card.dueAt)}`;
}

function CardList({ resourceId, onChanged }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const query = useDebouncedValue(q, 250);
  const [status, setStatus] = useState('all');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [page, setPage] = useState(1);

  const load = useCallback(
    async (p = 1) => {
      try {
        const res = await flashcardsApi.list({ q: query || undefined, status, resourceId, page: p, limit: 30 });
        setData((prev) => (p === 1 ? res : { ...res, cards: [...prev.cards, ...res.cards] }));
        setPage(p);
      } catch (err) {
        setError(err.message);
      }
    },
    [query, status, resourceId]
  );
  useEffect(() => {
    load(1);
  }, [load]);

  const refresh = () => {
    load(1);
    onChanged?.();
  };

  const toggleSuspend = async (c) => {
    try {
      await flashcardsApi.update(c.id, { suspended: !c.suspended });
      toast.success(c.suspended ? 'Card resumed' : 'Card suspended');
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async () => {
    const c = toDelete;
    setToDelete(null);
    try {
      await flashcardsApi.remove(c.id);
      toast.success('Card deleted');
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint" aria-hidden />
          <label htmlFor="card-search" className="sr-only">
            Search cards
          </label>
          <input id="card-search" className="mm-input !min-h-9 !py-1 !pl-8 text-sm" placeholder="Search cards" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label htmlFor="card-status" className="sr-only">
          Filter cards
        </label>
        <select id="card-status" className="mm-input !min-h-9 !w-auto !py-1 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All cards</option>
          <option value="due">Due now</option>
          <option value="new">New</option>
          <option value="suspended">Suspended</option>
        </select>
        <Button size="sm" icon={Plus} className="ml-auto" onClick={() => setCreating(true)}>
          New card
        </Button>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {!data ? (
        <Skeleton lines={6} />
      ) : data.cards.length === 0 ? (
        <div className="mm-card">
          <EmptyState icon={Layers} title={q || status !== 'all' ? 'No cards match' : 'No cards yet'} action={<Button size="sm" icon={Plus} onClick={() => setCreating(true)}>Add a card</Button>}>
            Add cards by hand, or open any note or document and choose “Generate cards”.
          </EmptyState>
        </div>
      ) : (
        <ul className="mm-card divide-y divide-line">
          {data.cards.map((c) => (
            <li key={c.id} className={cn('flex flex-col gap-2 p-4 sm:flex-row sm:items-start', c.suspended && 'opacity-60')}>
              <div className="min-w-0 flex-1">
                <p className="font-ui text-sm font-semibold break-words text-ink">{c.front}</p>
                <p className="mt-1 line-clamp-2 font-ui text-sm break-words text-ink-muted">{c.back}</p>
                <p className="mt-1.5 flex flex-wrap gap-x-3 font-ui text-[0.72rem] text-ink-faint lab:font-mono">
                  <span>{dueLabel(c)}</span>
                  {c.origin === 'ai' && (
                    <span className="inline-flex items-center gap-1">
                      <Sparkles size={10} aria-hidden /> Generated
                    </span>
                  )}
                  {c.resourceTitle && (
                    <Link to={`/vault/${c.resourceId}`} className="truncate hover:text-accent">
                      {c.resourceTitle}
                    </Link>
                  )}
                  {c.reviewCount > 0 && <span>{c.reviewCount} reviews</span>}
                </p>
              </div>
              <div className="flex shrink-0 gap-0.5">
                <Button variant="ghost" size="sm" iconOnly icon={Pencil} aria-label="Edit card" onClick={() => setEditing(c)} />
                <Button variant="ghost" size="sm" iconOnly icon={c.suspended ? Play : Pause} aria-label={c.suspended ? 'Resume card' : 'Suspend card'} onClick={() => toggleSuspend(c)} />
                <Button variant="ghost" size="sm" iconOnly icon={Trash2} aria-label="Delete card" onClick={() => setToDelete(c)} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {data?.hasMore && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={() => load(page + 1)}>
            Load more
          </Button>
        </div>
      )}

      <CardDialog open={creating || Boolean(editing)} card={editing} resourceId={resourceId} onClose={() => (setCreating(false), setEditing(null))} onSaved={refresh} />
      <Dialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        tone="danger"
        title="Delete this card?"
        description="Its review history is deleted with it."
        footer={
          <>
            <Button variant="ghost" onClick={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={remove}>
              Delete
            </Button>
          </>
        }
      />
    </div>
  );
}

export default function FlashcardsPage() {
  const { theme } = useTheme();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') === 'cards' ? 'cards' : 'review';
  const resourceId = sp.get('resource') || undefined;
  const [stats, setStats] = useState(null);

  const loadStats = useCallback(() => flashcardsApi.stats().then(setStats).catch(() => {}), []);
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return (
    <>
      <PageHeader
        eyebrow={theme === 'library' ? 'The Study' : theme === 'lab' ? '01 / Core · recall' : 'Learn'}
        title="Review"
        description="Flashcards scheduled with spaced repetition, so you review each idea just before you would forget it."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Due now" value={stats?.due} />
        <Stat label="New" value={stats?.new} />
        <Stat label="Reviewed today" value={stats?.reviewedToday} />
        <Stat label="Total cards" value={stats?.total} />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Flashcards" className="inline-flex rounded-pill border border-line bg-surface-2 p-0.5">
          {[
            { id: 'review', label: 'Review', icon: GraduationCap },
            { id: 'cards', label: 'All cards', icon: Layers },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setSp((prev) => {
                const next = new URLSearchParams(prev);
                if (t.id === 'review') next.delete('tab');
                else next.set('tab', t.id);
                return next;
              })}
              className={cn('flex items-center gap-1.5 rounded-pill px-3 py-1.5 font-ui text-xs font-semibold lab:font-mono lab:uppercase lab:tracking-wider', tab === t.id ? 'bg-accent text-accent-ink' : 'text-ink-muted hover:text-ink')}
            >
              <t.icon size={13} aria-hidden /> {t.label}
            </button>
          ))}
        </div>
        {resourceId && (
          <button type="button" className="mm-chip" aria-pressed="true" onClick={() => setSp((prev) => { const next = new URLSearchParams(prev); next.delete('resource'); return next; })}>
            Cards from one item <X size={11} aria-hidden />
          </button>
        )}
        {stats?.nextDue && !stats.due && tab === 'review' && <span className="font-ui text-xs text-ink-faint">Next card due {relativeTime(stats.nextDue)}</span>}
      </div>

      {tab === 'review' ? <ReviewSession key={resourceId || 'all'} resourceId={resourceId} onReviewed={loadStats} /> : <CardList resourceId={resourceId} onChanged={loadStats} />}
    </>
  );
}
