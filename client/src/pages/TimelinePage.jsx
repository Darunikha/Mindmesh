import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, FileText, FolderPlus, Globe, History, Link2, MessageSquareText, NotebookPen, Search } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader.jsx';
import Button from '../components/ui/Button.jsx';
import Alert from '../components/ui/Alert.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { timelineApi } from '../api/discovery.js';
import { useTheme } from '../context/ThemeContext.jsx';
import { themedDate } from '../lib/format.js';
import { cn } from '../lib/cn.js';

export const ACTIVITY = {
  note_created: { label: 'Notes written', verb: 'Wrote a note', icon: NotebookPen, tint: 'text-accent', bg: 'bg-accent-soft' },
  document_uploaded: { label: 'Documents added', verb: 'Uploaded a document', icon: FileText, tint: 'text-accent-2', bg: 'bg-accent-2-soft' },
  link_saved: { label: 'Links saved', verb: 'Saved a link', icon: Globe, tint: 'text-accent-3', bg: 'bg-accent-3-soft' },
  collection_created: { label: 'Collections', verb: 'Created a collection', icon: FolderPlus, tint: 'text-accent-2', bg: 'bg-accent-2-soft' },
  connection_created: { label: 'Connections', verb: 'Connected', icon: Link2, tint: 'text-accent', bg: 'bg-accent-soft' },
  search: { label: 'Topics searched', verb: 'Searched for', icon: Search, tint: 'text-accent-3', bg: 'bg-accent-3-soft' },
  conversation_started: { label: 'Questions asked', verb: 'Asked', icon: MessageSquareText, tint: 'text-accent-2', bg: 'bg-accent-2-soft' },
  resource_opened: { label: 'Items revisited', verb: 'Opened', icon: Eye, tint: 'text-ink-muted', bg: 'bg-sunken' },
};
const TYPES = Object.keys(ACTIVITY);
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const dayKey = (d) => new Date(d).toLocaleDateString('en-CA');

function href(a) {
  if (a.type === 'search') return `/search?q=${encodeURIComponent(a.title)}`;
  if (a.type === 'conversation_started' && a.conversationId) return `/assistant/${a.conversationId}`;
  if (a.type === 'collection_created' && a.collectionId) return `/vault?collection=${a.collectionId}`;
  if (a.type === 'connection_created' && a.resourceId && a.resourceExists) return '/graph';
  if (a.resourceId && a.resourceExists) return `/vault/${a.resourceId}`;
  return null;
}

/** 12-week activity heat map (columns = weeks, rows = weekdays). */
function HeatStrip({ summary }) {
  const weeks = 12;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - (weeks * 7 - 1) - start.getDay());
  const cells = [];
  let max = 0;
  for (let d = new Date(start); d <= today; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const counts = summary.byDay[dayKey(d)] || {};
    const n = Object.values(counts).reduce((a, b) => a + b, 0);
    max = Math.max(max, n);
    cells.push({ d, n });
  }
  const level = (n) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / Math.max(max, 1)) * 4)));
  const shades = ['bg-sunken mm-heat-empty', 'bg-accent/25', 'bg-accent/45', 'bg-accent/70', 'bg-accent'];
  return (
    <div className="overflow-x-auto">
      <div className="grid w-max grid-flow-col grid-rows-7 gap-[3px]" role="img" aria-label="Activity over the last 12 weeks">
        {cells.map(({ d, n }) => (
          <span
            key={d.toISOString()}
            title={`${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${n} ${n === 1 ? 'event' : 'events'}`}
            className={cn('h-3 w-3 rounded-[3px] library:rounded-[1px] lab:rounded-[2px]', shades[level(n)])}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1 font-ui text-[0.68rem] text-ink-faint">
        Less
        {shades.map((s) => (
          <span key={s} className={cn('h-2.5 w-2.5 rounded-[2px]', s)} />
        ))}
        More
      </div>
    </div>
  );
}

function Entry({ a }) {
  const { theme } = useTheme();
  const meta = ACTIVITY[a.type];
  const Icon = meta.icon;
  const to = href(a);
  const time = new Date(a.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: theme !== 'lab' });
  const title = a.type === 'search' || a.type === 'conversation_started' ? `“${a.title}”` : a.title;
  const body = (
    <>
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full lab:rounded-[6px] library:border library:border-line-strong', meta.bg, meta.tint)}>
        <Icon size={15} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-ui text-xs text-ink-faint lab:font-mono lab:uppercase lab:tracking-wider">{meta.verb}</span>
        <span className={cn('block truncate font-ui text-sm text-ink library:font-display library:text-base', to && 'group-hover:text-accent', a.resourceExists === false && 'text-ink-faint line-through')}>
          {title || 'Untitled'}
        </span>
        {a.type === 'search' && a.meta?.resultCount != null && <span className="block font-ui text-[0.7rem] text-ink-faint">{a.meta.resultCount} results</span>}
        {a.resourceExists === false && <span className="block font-ui text-[0.7rem] text-ink-faint">Since deleted</span>}
      </span>
      <time dateTime={a.at} className="shrink-0 font-ui text-xs text-ink-faint lab:font-mono">
        {time}
      </time>
    </>
  );
  return (
    <li>
      {to ? (
        <Link to={to} className="group flex items-center gap-3 rounded-control px-2 py-2 hover:bg-sunken">
          {body}
        </Link>
      ) : (
        <div className="flex items-center gap-3 px-2 py-2">{body}</div>
      )}
    </li>
  );
}

export default function TimelinePage() {
  const { theme } = useTheme();
  const [sp, setSp] = useSearchParams();
  const types = (sp.get('types') || '').split(',').filter(Boolean);
  const from = sp.get('from') || '';
  const to = sp.get('to') || '';

  const [summary, setSummary] = useState(null);
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState({ hasMore: false, nextBefore: null });
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const set = (patch) =>
    setSp(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
        return next;
      },
      { replace: true }
    );

  useEffect(() => {
    timelineApi
      .summary({ days: 90, tz: TZ })
      .then(setSummary)
      .catch(() => setSummary({ byDay: {}, totals: {} }));
  }, []);

  const key = sp.toString();
  const load = useCallback(
    async (before) => {
      setStatus(before ? 'more' : 'loading');
      setError(null);
      try {
        const res = await timelineApi.list({ types, from, to, before, limit: 40 });
        setItems((prev) => (before ? [...prev, ...res.items] : res.items));
        setCursor({ hasMore: res.hasMore, nextBefore: res.nextBefore });
        setStatus('ready');
      } catch (err) {
        setError(err.message);
        setStatus('error');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  );
  useEffect(() => {
    load();
  }, [load]);

  const days = useMemo(() => {
    const out = [];
    for (const a of items) {
      const k = dayKey(a.at);
      if (!out.length || out.at(-1).key !== k) out.push({ key: k, date: new Date(a.at), items: [] });
      out.at(-1).items.push(a);
    }
    return out;
  }, [items]);

  const toggleType = (t) => {
    const next = types.includes(t) ? types.filter((x) => x !== t) : [...types, t];
    set({ types: next.join(',') });
  };

  const dayLabel = (d) => {
    const today = dayKey(new Date());
    const yesterday = dayKey(new Date(Date.now() - 86400000));
    if (dayKey(d) === today) return 'Today';
    if (dayKey(d) === yesterday) return 'Yesterday';
    return themedDate(theme, d).split(' · ')[0];
  };

  return (
    <>
      <PageHeader eyebrow={theme === 'library' ? 'The Archive' : theme === 'lab' ? '03 / Analysis · log' : 'Discover'} title="Knowledge Timeline" description="How your library has grown: what you added, connected, asked and revisited." />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-label="Activity" className="order-2 min-w-0 lg:order-1">
          {status === 'error' && <Alert tone="error">{error}</Alert>}
          {status === 'loading' ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton lines={6} />
            </div>
          ) : days.length === 0 ? (
            <div className="mm-card">
              <EmptyState icon={History} title={types.length || from || to ? 'No activity matches these filters' : 'No activity yet'}>
                {types.length || from || to ? 'Try another date range or activity type.' : 'Write a note, upload a document or ask the assistant something, and it will appear here.'}
              </EmptyState>
            </div>
          ) : (
            <ol className="space-y-6">
              {days.map((d) => (
                <li key={d.key}>
                  <h2
                    className={cn(
                      'sticky top-0 z-10 mb-2 py-1 font-display text-ink',
                      'library:bg-bg library:text-xl library:italic',
                      'studio:bg-bg studio:text-base studio:font-bold',
                      'lab:bg-bg lab:font-mono lab:text-xs lab:tracking-[0.16em] lab:text-accent lab:uppercase'
                    )}
                  >
                    {theme === 'lab' ? `${d.key} · ${d.items.length} events` : dayLabel(d.date)}
                  </h2>
                  <ul className="mm-card divide-y divide-line px-2 py-1 mm-card-ruled lab:border-l-2 lab:border-l-accent">
                    {d.items.map((a) => (
                      <Entry key={a.id} a={a} />
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
          {cursor.hasMore && status !== 'loading' && (
            <div className="mt-6 flex justify-center">
              <Button variant="secondary" loading={status === 'more'} onClick={() => load(cursor.nextBefore)}>
                Show earlier activity
              </Button>
            </div>
          )}
        </section>

        <aside className="order-1 min-w-0 space-y-4 lg:order-2" aria-label="Timeline filters">
          <div className="mm-card p-4">
            <p className="mm-eyebrow mb-3">Last 12 weeks</p>
            {summary ? <HeatStrip summary={summary} /> : <Skeleton className="h-24" />}
          </div>
          <div className="mm-card p-4">
            <p className="mm-eyebrow mb-3">Activity type</p>
            <div className="flex flex-wrap gap-1.5">
              {TYPES.map((t) => {
                const m = ACTIVITY[t];
                const n = summary?.totals?.[t] || 0;
                return (
                  <button key={t} type="button" className="mm-chip !py-1" aria-pressed={types.includes(t)} onClick={() => toggleType(t)}>
                    <m.icon size={12} aria-hidden /> {m.label}
                    {summary && <span className="font-mono text-[0.62rem] opacity-60">{n}</span>}
                  </button>
                );
              })}
            </div>
            {summary && <p className="mt-2 font-ui text-[0.68rem] text-ink-faint">Counts cover the last 90 days.</p>}
          </div>
          <div className="mm-card p-4">
            <p className="mm-eyebrow mb-3">Date range</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <label className="font-ui text-xs text-ink-muted">
                From
                <input type="date" className="mm-input mt-1 !min-h-9 !py-1 text-sm" value={from} max={to || undefined} onChange={(e) => set({ from: e.target.value })} />
              </label>
              <label className="font-ui text-xs text-ink-muted">
                To
                <input type="date" className="mm-input mt-1 !min-h-9 !py-1 text-sm" value={to} min={from || undefined} onChange={(e) => set({ to: e.target.value })} />
              </label>
            </div>
            {(types.length > 0 || from || to) && (
              <button type="button" className="mt-3 font-ui text-xs text-ink-muted underline-offset-2 hover:underline" onClick={() => setSp({}, { replace: true })}>
                Clear filters
              </button>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
