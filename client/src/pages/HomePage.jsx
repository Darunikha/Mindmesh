import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Compass, FileText, MessageSquareText, Palette, Plus, Sparkles, Upload, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { usersApi } from '../api/endpoints.js';
import { THEMES } from '../themes/registry.js';
import { firstName, formatDate, relativeTime, themedDate, timeOfDay } from '../lib/format.js';
import { ANSWER_MODE_OPTIONS } from '../lib/aiModes.js';
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

function QuickAction({ icon: Icon, label, hint, to, phase, tone = 'accent' }) {
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
  return (
    <Link to={to} className={cn(cls, 'hover:border-line-strong studio:hover:bg-sunken')}>
      {inner}
    </Link>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const t = THEMES[theme];
  const [sessions, setSessions] = useState(null);
  const [sessionsError, setSessionsError] = useState(null);

  useEffect(() => {
    let alive = true;
    usersApi
      .sessions()
      .then((d) => alive && setSessions(d.sessions))
      .catch((e) => alive && setSessionsError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const greeting = t.greeting[timeOfDay()];
  const mode = ANSWER_MODE_OPTIONS.find((m) => m.value === user.preferences?.ai?.defaultMode) || ANSWER_MODE_OPTIONS[0];
  const interests = user.interests || [];

  const checklist = [
    { label: 'Create your account', done: true },
    { label: 'Choose a theme', done: user.onboardingCompleted },
    { label: 'Pick topics you care about', done: interests.length > 0, to: '/settings/profile' },
    { label: 'Add a bio to your profile', done: Boolean(user.bio), to: '/settings/profile' },
    { label: 'Save your first note', done: false, phase: 2 },
    { label: 'Ask the assistant a question', done: false, phase: 3 },
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
              <div
                className="flex items-center gap-2 rounded-control border border-line bg-sunken px-3 py-2.5 opacity-70 studio:border-white/10 studio:bg-white/5"
                aria-disabled="true"
              >
                <Sparkles size={16} className="text-accent studio:text-[#f4c95d]" aria-hidden />
                <span className="flex-1 font-ui text-sm text-ink-faint studio:text-[#9a95ad]">Ask anything…</span>
                <span className="rounded-pill border border-line px-1.5 py-px font-mono text-[0.6rem] text-ink-faint uppercase studio:border-white/15">
                  Phase 3
                </span>
              </div>
              <Link to="/settings/ai" className="mt-2 inline-flex font-ui text-xs text-ink-muted underline-offset-4 hover:underline studio:text-[#bdb8cc]">
                Set assistant preferences now
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
              <QuickAction icon={FileText} label="New note" phase={2} />
              <QuickAction icon={Upload} label="Upload a document" phase={2} tone="accent-3" />
              <QuickAction icon={MessageSquareText} label="Start a conversation" phase={3} tone="accent-2" />
              <QuickAction icon={UserRound} label="Edit your profile" hint="Name, bio and topics" to="/settings/profile" tone="accent-2" />
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
            <p className="mt-4 font-ui text-xs text-ink-faint">Suggestions drawn from your saved knowledge arrive with Smart Search (Phase 4).</p>
          </Card>
        </motion.div>

        {/* Activity */}
        <motion.div {...fade(5)} className="lg:col-span-2">
          <Card className="h-full p-5 sm:p-6">
            <CardHeader eyebrow="Knowledge activity" title="Your library" />
            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1.1fr]">
              <EmptyState icon={FileText} title="Nothing saved yet" compact className="rounded-card border border-dashed border-line-strong">
                Recent notes, documents and searches will appear here once the Knowledge Vault opens in Phase 2.
              </EmptyState>
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
