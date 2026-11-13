import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, PartyPopper } from 'lucide-react';
import Button from '../ui/Button.jsx';
import Alert from '../ui/Alert.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import { flashcardsApi } from '../../api/chat.js';
import { useTheme } from '../../context/ThemeContext.jsx';
import { cn } from '../../lib/cn.js';

const GRADE_BUTTONS = [
  { grade: 'again', label: 'Again', key: '1', cls: 'border-danger/40 text-danger hover:bg-danger-soft' },
  { grade: 'hard', label: 'Hard', key: '2', cls: 'border-line-strong text-ink hover:bg-sunken' },
  { grade: 'good', label: 'Good', key: '3', cls: 'border-success/50 text-success hover:bg-success-soft' },
  { grade: 'easy', label: 'Easy', key: '4', cls: 'border-accent/50 text-accent hover:bg-accent-soft' },
];

/**
 * One review session: due cards one at a time. Space reveals the answer; 1–4 grade it.
 * Cards answered "Again" come back in the same session (they are due again in 10 minutes).
 */
export default function ReviewSession({ resourceId, onReviewed }) {
  const { theme } = useTheme();
  const [queue, setQueue] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await flashcardsApi.due({ limit: 20, resourceId });
      setQueue(res.cards);
      setRemaining(res.remaining);
      setRevealed(false);
    } catch (err) {
      setError(err.message);
      setQueue([]);
    }
  }, [resourceId]);

  useEffect(() => {
    load();
  }, [load]);

  const card = queue?.[0];

  const grade = useCallback(
    async (g) => {
      if (!card || busy) return;
      setBusy(true);
      try {
        const { card: updated } = await flashcardsApi.review(card.id, g);
        setDone((n) => n + 1);
        onReviewed?.();
        setQueue((q) => {
          const rest = q.slice(1);
          // A lapsed card is shown again at the end of this session.
          return g === 'again' ? [...rest, updated] : rest;
        });
        setRemaining((n) => (g === 'again' ? n : Math.max(0, n - 1)));
        setRevealed(false);
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    },
    [card, busy, onReviewed]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, textarea, select, [contenteditable]')) return;
      if (e.code === 'Space' && card && !revealed) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed) {
        const b = GRADE_BUTTONS.find((x) => x.key === e.key);
        if (b) grade(b.grade);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card, revealed, grade]);

  if (queue === null) return <Skeleton className="h-72" />;
  if (error && !card) return <Alert tone="error">{error}</Alert>;

  if (!card) {
    return (
      <div className="mm-card mm-card-ruled">
        <EmptyState
          icon={PartyPopper}
          title={done ? `Session complete: ${done} review${done === 1 ? '' : 's'}` : 'Nothing due right now'}
          action={
            remaining > 0 ? (
              <Button onClick={load}>Continue with {remaining} more</Button>
            ) : (
              <Button to="/vault" variant="secondary">
                Make cards from your notes
              </Button>
            )
          }
        >
          {done ? 'Nice work. Cards come back just before you would forget them.' : 'Cards you create or generate from your notes appear here when they are due.'}
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex items-center justify-between font-ui text-xs text-ink-muted lab:font-mono lab:uppercase lab:tracking-wider">
        <span>
          {done} reviewed · {queue.length} in this session{remaining > queue.length ? ` · ${remaining - queue.length} more due` : ''}
        </span>
        {card.resourceTitle && card.resourceId && (
          <Link to={`/vault/${card.resourceId}`} className="truncate hover:text-accent">
            From: {card.resourceTitle}
          </Link>
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={`${card.id}-${card.reviewCount}`}
          initial={{ opacity: 0, y: 12, rotateX: -6 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
          className={cn(
            'mm-card mm-card-ruled flex min-h-[18rem] flex-col p-6 sm:p-10',
            'studio:rounded-[28px]',
            'lab:border-l-2 lab:border-l-accent'
          )}
          aria-live="polite"
        >
          <p className="mm-eyebrow mb-3">{card.isNew ? (theme === 'lab' ? 'NEW CARD' : 'New card') : theme === 'lab' ? 'REVIEW' : 'Question'}</p>
          <p className="font-display text-2xl leading-snug whitespace-pre-wrap text-ink sm:text-3xl library:text-[2rem]">{card.front}</p>
          {revealed && (
            <>
              <hr className="mm-rule my-6" />
              <p className="mm-eyebrow mb-2">Answer</p>
              <p className="font-body text-lg leading-relaxed whitespace-pre-wrap text-ink">{card.back}</p>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {error && (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      )}

      <div className="mt-5">
        {!revealed ? (
          <Button size="lg" className="w-full" icon={Eye} onClick={() => setRevealed(true)}>
            Show answer <span className="ml-1 hidden font-mono text-xs opacity-70 sm:inline">(Space)</span>
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="How well did you remember?">
            {GRADE_BUTTONS.map((b) => (
              <button
                key={b.grade}
                type="button"
                disabled={busy}
                onClick={() => grade(b.grade)}
                className={cn('flex flex-col items-center gap-0.5 rounded-control border bg-surface px-3 py-2.5 font-ui transition-colors disabled:opacity-50', b.cls)}
              >
                <span className="text-sm font-semibold">{b.label}</span>
                <span className="font-mono text-[0.68rem] opacity-80">
                  {card.previews[b.grade]} · {b.key}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="mt-3 text-center font-ui text-xs text-ink-faint">The next review is scheduled from how well you remembered. “Again” brings the card back in this session.</p>
    </div>
  );
}
