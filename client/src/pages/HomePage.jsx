import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Compass, FileText, Link2, MessageSquareText, Palette, Plus, Sparkles, Upload } from 'lucide-react';
import { libraryApi } from '../api/library.js';
import { searchApi } from '../api/discovery.js';
import { useToast } from '../context/ToastContext.jsx';
import { TypeBadge } from '../components/library/Badges.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { usersApi } from '../api/endpoints.js';
import { THEMES } from '../themes/registry.js';
import { firstName, formatDate, relativeTime, themedDate, timeOfDay } from '../lib/format.js';
import { ANSWER_MODE_OPTIONS, normalizeMode } from '../lib/aiModes.js';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import InterestConstellation from '../components/theme/InterestConstellation.jsx';
import { cn } from '../lib/cn.js';

const fade = (i) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay: 0.05 * i, ease: [0.2, 0.8, 0.2, 1] },
});

function QuickAction({ icon: Icon, label, hint, to, onClick, busy, phase, tone = 'accent' }) {
  const tones = {
    accent: 'studio:bg-accent-soft studio:text-accent',
    'accent-2': 'studio:bg-accent-2-soft studio:text-accent-2',
    'accent-3': 'studio:bg-accent-3-soft studio:text-accent-3',
  };
  const inner = (
    <>
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center text-accent',
          'library:rounded-full library:border library:border-line-strong',
          'studio:rounded-[14px]',
          tones[tone],
          'lab:rounded-[6px] lab:border lab:border-line-strong lab:bg-sunken'
        )}
      >
        <Icon size={18} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-ui text-[0.92rem] font-semibold text-ink">{label}</span>
        <span className="block truncate font-ui text-xs text-ink-muted">{phase ? `Arrives in Phase ${phase}` : hint}</span>
      </span>
      {!phase && <ArrowRight size={16} className="text-ink-faint transition-transform group-hover:translate-x-0.5" aria-hidden />}
    </>
  );
  const cls = 'group flex items-center gap-3 rounded-card border border-line bg-surface p-3 transition-colors studio:border-transparent studio:bg-surface-2';
  if (phase) {
    return (
      <div className={cn(cls, 'cursor-not-allowed opacity-55')} aria-disabled="true">
        {inner}
      </div>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={busy} aria-busy={busy || undefined} className={cn(cls, 'w-full text-left hover:border-line-strong disabled:opacity-60 studio:hover:bg-sunken')}>
        {inner}
      </button>
    );
  }
  return (
    <Link to={to} className={cn(cls, 'hover:border-line-strong studio:hover:bg-sunken')}>
      {inner}
    </Link>
  );
}

function RecentList({ title, items, empty }) {
  return (
    <div>
      <p className="mm-eyebrow mb-2">{title}</p>
      {items?.length ? (
        <ul className="space-y-0.5">
          {items.map((r) => (
            <li key={r.id}>
              <Link to={`/vault/${r.id}`} className="group flex items-center gap-2.5 rounded-control px-2 py-1.5 hover:bg-sunken">
                <TypeBadge type={r.type} className="w-[4.5rem] shrink-0" />
                <span className="min-w-0 flex-1 truncate font-ui text-sm text-ink group-hover:text-accent library:font-display library:text-base">{r.title}</span>
                <span className="shrink-0 font-ui text-xs text-ink-faint">{relativeTime(r.lastAccessedAt || r.createdAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-2 font-ui text-sm text-ink-faint">{empty}</p>
      )}
    </div>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const t = THEMES[theme];
  const [sessions, setSessions] = useState(null);
  const [sessionsError, setSessionsError] = useState(null);
  const [overview, setOverview] = useState(null);
  const [recentSearches, setRecentSearches] = useState(null);
  const [overviewError, setOverviewError] = useState(null);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    usersApi
      .sessions()
      .then((d) => alive && setSessions(d.sessions))
      .catch((e) => alive && setSessionsError(e.message));
    searchApi
      .recent()
      .then((d) => alive && setRecentSearches(d.searches))
      .catch(() => alive && setRecentSearches([]));
    libraryApi
      .overview()
      .then((d) => alive && setOverview(d))
      .catch((e) => alive && setOverviewError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const newNote = async () => {
    setCreating(true);
    try {
      const { resource } = await libraryApi.createNote({});
      navigate(`/vault/${resource.id}`, { state: { fresh: true } });
    } catch (err) {
      toast.error(err.message);
      setCreating(false);
    }
  };
  const libraryTotal = overview?.counts.total ?? 0;

  const greeting = t.greeting[timeOfDay()];
  const mode = ANSWER_MODE_OPTIONS.find((m) => m.value === normalizeMode(user.preferences?.ai?.defaultMode));
  const [askDraft, setAskDraft] = useState('');
  const interests = user.interests || [];

  const checklist = [
    { label: 'Create your account', done: true },
    { label: 'Choose a theme', done: user.onboardingCompleted },
    { label: 'Pick topics you care about', done: interests.length > 0, to: '/settings/profile' },
    { label: 'Add a bio to your profile', done: Boolean(user.bio), to: '/settings/profile' },
    { label: 'Add something to your vault', done: libraryTotal > 0, to: '/vault' },
    { label: 'Ask the assistant a question', done: false, to: '/assistant' },
  ];
  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <motion.section {...fade(0)} className="grid items-stretch gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="flex flex-col justify-center py-2">
          <p className="mm-eyebrow mb-3">{themedDate(theme)}</p>
          <h1 className="mm-display text-[2.6rem] leading-[1.05] text-ink sm:text-5xl library:sm:text-6xl lab:sm:text-[2.8rem]">
            {greeting}, <em>{firstName(user.name)}</em>.
          </h1>
          <p className="mt-4 max-w-xl font-ui text-[1rem] leading-relaxed text-ink-muted">
            {interests.length
              ? `Your workspace is tuned to ${interests.length} topic${interests.length === 1 ? '' : 's'}. Once the vault opens, everything you save will start connecting here.`
              : 'Your workspace is ready. Add a few topics you care about to shape your home page and knowledge graph.'}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button to="/settings/profile" variant="secondary" icon={Compass}>
              {interests.length ? 'Refine interests' : 'Add interests'}
            </Button>
            <Button to="/settings/appearance" variant="ghost" icon={Palette}>
              Switch room
            </Button>
          </div>
        </div>

        <Card ruled className="relative min-h-[260px] overflow-hidden p-4">
          <p className="mm-eyebrow absolute top-4 left-5 z-10">Interest map</p>
          {interests.length ? (
            <div className="h-full pt-6">
              <InterestConstellation name={firstName(user.name)} interests={interests} />
            </div>
          ) : (
            <EmptyState
              icon={Compass}
              title="No topics yet"
              action={
                <Button to="/settings/profile" size="sm" icon={Plus}>
                  Add topics
                </Button>
              }
              className="h-full justify-center"
            >
              Topics you pick become the first nodes of your knowledge graph.
            </EmptyState>
          )}
        </Card>
      </motion.section>

      {/* Assistant entry point */}
      <motion.div {...fade(1)}>
        <Card className="overflow-hidden p-5 sm:p-6 studio:bg-ink lab:border-line-strong">
          <div className="flex flex-col gap-5 md:flex-row md:items-center">
            <div className="flex-1">
              <p className="mm-eyebrow mb-2 studio:!text-[#c9c3ff]">Ask {t.assistantName}</p>
              <h2 className="text-2xl text-ink library:text-3xl studio:text-surface">An assistant that knows the world, and your work.</h2>
              <p className="mt-2 max-w-xl font-ui text-sm text-ink-muted studio:text-[#bdb8cc]">
                General questions, writing, code and research, plus answers grounded in your own sources. Your default mode is{' '}
                <span className="font-semibold text-ink studio:text-surface">{mode.label}</span>.
              </p>
            </div>
            <div className="w-full md:w-[340px]">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (askDraft.trim()) navigate('/assistant', { state: { prompt: askDraft.trim(), mode: mode.value } });
                }}
                className="flex items-center gap-2 rounded-control border border-line bg-surface px-3 py-1.5 focus-within:border-accent studio:border-white/10 studio:bg-white/5"
              >
                <Sparkles size={16} className="shrink-0 text-accent studio:text-[#f4c95d]" aria-hidden />
                <label htmlFor="home-ask" className="sr-only">
                  Ask the assistant
                </label>
                <input
                  id="home-ask"
                  value={askDraft}
                  onChange={(e) => setAskDraft(e.target.value)}
                  maxLength={12000}
                  placeholder="Ask anything…"
                  className="min-w-0 flex-1 bg-transparent py-1 font-ui text-sm text-ink outline-none placeholder:text-ink-faint studio:text-surface studio:placeholder:text-[#9a95ad]"
                />
                <button type="submit" disabled={!askDraft.trim()} className="mm-btn mm-btn-primary mm-btn-sm mm-btn-icon" aria-label="Ask">
                  <ArrowRight size={14} />
                </button>
              </form>
              <Link to="/assistant" className="mt-2 inline-flex font-ui text-xs text-ink-muted underline-offset-4 hover:underline studio:text-[#bdb8cc]">
                Open the assistant and your chat history
              </Link>
            </div>
          </div>
        </Card>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Quick actions */}
        <motion.div {...fade(2)} className="lg:col-span-2">
          <Card className="h-full p-5 sm:p-6">
            <CardHeader eyebrow="Quick actions" title="Get things moving" />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <QuickAction icon={FileText} label="New note" hint="Start writing with autosave" onClick={newNote} busy={creating} />
              <QuickAction icon={Upload} label="Upload a document" hint="PDF, Word, text, Markdown…" to="/vault?upload=1" tone="accent-3" />
              <QuickAction icon={Link2} label="Save a link" hint="Keep a web page and its text" to="/vault?link=1" tone="accent-2" />
              <QuickAction icon={MessageSquareText} label="Start a conversation" hint="General AI or My Knowledge" to="/assistant" tone="accent-2" />
            </div>
          </Card>
        </motion.div>

        {/* Getting started */}
        <motion.div {...fade(3)}>
          <Card ruled className="h-full p-5 sm:p-6">
            <CardHeader eyebrow="Getting started" title={`${doneCount} of ${checklist.length} done`} />
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={checklist.length} aria-valuenow={doneCount}>
              <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${(doneCount / checklist.length) * 100}%` }} transition={{ duration: 0.8 }} />
            </div>
            <ul className="mt-4 space-y-2.5">
              {checklist.map((c) => {
                const row = (
                  <>
                    <span
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border lab:rounded-[4px]',
                        c.done ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong'
                      )}
                    >
                      {c.done && <Check size={11} strokeWidth={3} aria-hidden />}
                    </span>
                    <span className={cn('flex-1 font-ui text-sm', c.done ? 'text-ink-faint line-through' : 'text-ink')}>{c.label}</span>
                    {c.phase && <span className="font-mono text-[0.62rem] text-ink-faint uppercase">P{c.phase}</span>}
                  </>
                );
                return (
                  <li key={c.label}>
                    {c.to && !c.done ? (
                      <Link to={c.to} className="flex items-center gap-3 hover:[&>span:nth-child(2)]:text-accent">
                        {row}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3">{row}</div>
                    )}
                    <span className="sr-only">{c.done ? '(completed)' : '(not completed)'}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </motion.div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Topics */}
        <motion.div {...fade(4)}>
          <Card className="h-full p-5 sm:p-6">
            <CardHeader
              eyebrow="Suggested to explore"
              title="Your topics"
              action={
                <Link to="/settings/profile" className="font-ui text-xs text-ink-muted hover:text-accent">
                  Edit
                </Link>
              }
            />
            {interests.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {interests.map((i) => (
                  <span key={i} className="mm-chip">
                    {i}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-4 font-ui text-sm text-ink-muted">No topics yet. Add some to personalise suggestions.</p>
            )}
            <p className="mm-eyebrow mt-5 mb-2">Recent searches</p>
            {recentSearches === null ? (
              <Skeleton lines={2} />
            ) : recentSearches.length ? (
              <div className="flex flex-wrap gap-1.5">
                {recentSearches.slice(0, 5).map((s) => (
                  <Link key={s.id} to={`/search?q=${encodeURIComponent(s.query)}`} className="mm-chip">
                    {s.query}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="font-ui text-xs text-ink-faint">
                Nothing yet.{' '}
                <Link to="/search" className="text-accent hover:underline">
                  Search your knowledge
                </Link>
              </p>
            )}
          </Card>
        </motion.div>

        {/* Activity */}
        <motion.div {...fade(5)} className="lg:col-span-2">
          <Card className="h-full p-5 sm:p-6">
            <CardHeader eyebrow="Knowledge activity" title="Your library" />
            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1.1fr]">
              {overviewError ? (
                <p className="font-ui text-sm text-danger">{overviewError}</p>
              ) : !overview ? (
                <Skeleton lines={5} />
              ) : libraryTotal === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="Nothing saved yet"
                  compact
                  className="rounded-card border border-dashed border-line-strong"
                  action={
                    <Button size="sm" icon={Plus} onClick={newNote} loading={creating}>
                      New note
                    </Button>
                  }
                >
                  Notes, documents and links you add will appear here.
                </EmptyState>
              ) : (
                <div className="space-y-4">
                  <RecentList title="Recently opened" items={overview.recentlyAccessed.slice(0, 4)} empty="Nothing opened yet." />
                  <RecentList title="Recently added" items={overview.recentlyAdded.slice(0, 4)} empty="Nothing added yet." />
                </div>
              )}
              <dl className="space-y-3 font-ui text-sm">
                <div className="flex items-baseline justify-between gap-3 border-b border-line pb-3">
                  <dt className="text-ink-muted">Member since</dt>
                  <dd className="text-ink">{formatDate(user.createdAt)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-b border-line pb-3">
                  <dt className="text-ink-muted">Last sign-in</dt>
                  <dd className="text-ink">{relativeTime(user.lastLoginAt)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-b border-line pb-3">
                  <dt className="text-ink-muted">Active sessions</dt>
                  <dd className="text-ink">
                    {sessionsError ? (
                      <span className="text-danger">Unavailable</span>
                    ) : sessions ? (
                      <Link to="/settings/security" className="hover:text-accent">
                        {sessions.length} device{sessions.length === 1 ? '' : 's'}
                      </Link>
                    ) : (
                      <Skeleton className="h-4 w-16" />
                    )}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-muted">Current room</dt>
                  <dd className="text-ink">{t.name}</dd>
                </div>
              </dl>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
