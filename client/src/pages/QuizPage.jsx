import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDot, GraduationCap, Layers, RotateCcw, XCircle } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader.jsx';
import Button from '../components/ui/Button.jsx';
import Alert from '../components/ui/Alert.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { TextArea } from '../components/ui/Field.jsx';
import CollectionSelect from '../components/library/CollectionSelect.jsx';
import { quizApi } from '../api/chat.js';
import { useTheme } from '../context/ThemeContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { relativeTime } from '../lib/format.js';
import { cn } from '../lib/cn.js';

const VERDICT = {
  correct: { label: 'Correct', icon: CheckCircle2, cls: 'text-success bg-success-soft border-success/30' },
  partial: { label: 'Partly right', icon: CircleDot, cls: 'text-accent-3 bg-accent-3-soft border-accent-3/30' },
  incorrect: { label: 'Not quite', icon: XCircle, cls: 'text-danger bg-danger-soft border-danger/30' },
};

function Setup({ initialResource, onStarted }) {
  const toast = useToast();
  const [collectionId, setCollectionId] = useState(null);
  const [count, setCount] = useState(6);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);
  const [recent, setRecent] = useState(null);

  useEffect(() => {
    quizApi.list().then((d) => setRecent(d.quizzes)).catch(() => setRecent([]));
  }, []);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const scope = initialResource ? { type: 'resource', id: initialResource } : collectionId ? { type: 'collection', id: collectionId } : { type: 'all' };
      const { quiz } = await quizApi.start({ scope, count });
      onStarted(quiz);
    } catch (err) {
      setError(err.message);
      if (err.code === 'AI_NOT_CONFIGURED') toast.info('Add your Anthropic API key to server/.env to use quizzes.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="mm-card mm-card-ruled min-w-0 p-5 sm:p-8">
        <p className="mm-eyebrow mb-2">New quiz</p>
        <h2 className="font-display text-2xl text-ink library:text-3xl">{initialResource ? 'Quiz me on this item' : 'What should I test you on?'}</h2>
        <p className="mt-2 max-w-xl font-ui text-sm text-ink-muted">
          Questions are written from your own notes and documents. Answer in your own words, and each answer is graded against the source passage, which is shown afterwards so you can judge the grading yourself.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {!initialResource && <CollectionSelect label="Scope" noneLabel="Everything in my vault" value={collectionId} onChange={setCollectionId} />}
          <div>
            <label htmlFor="q-count" className="mm-label">
              Questions
            </label>
            <select id="q-count" className="mm-input" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[4, 6, 8, 10].map((n) => (
                <option key={n} value={n}>
                  {n} questions
                </option>
              ))}
            </select>
          </div>
        </div>
        {error && (
          <Alert tone="error" className="mt-4">
            {error}
          </Alert>
        )}
        <Button size="lg" className="mt-6" icon={GraduationCap} loading={starting} onClick={start}>
          {starting ? 'Writing questions…' : 'Start quiz'}
        </Button>
      </div>

      <aside className="mm-card min-w-0 p-5" aria-label="Recent quizzes">
        <p className="mm-eyebrow mb-3">Recent quizzes</p>
        {recent === null ? (
          <Skeleton lines={3} />
        ) : recent.length === 0 ? (
          <p className="font-ui text-sm text-ink-faint">Your quiz history appears here.</p>
        ) : (
          <ul className="space-y-1">
            {recent.map((q) => (
              <li key={q.id}>
                <button type="button" onClick={() => onStarted(null, q.id)} className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left hover:bg-sunken">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-ui text-sm text-ink">{q.title.replace(/^Quiz: /, '')}</span>
                    <span className="block font-ui text-[0.7rem] text-ink-faint">{relativeTime(q.createdAt)}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs text-ink-muted">{q.status === 'complete' ? `${q.score}%` : `${q.answered}/${q.total}`}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

function Feedback({ q }) {
  const v = VERDICT[q.verdict];
  const Icon = v.icon;
  return (
    <div className="mt-5 space-y-4" aria-live="polite">
      <div className={cn('flex items-start gap-2.5 rounded-card border p-4', v.cls)}>
        <Icon size={18} className="mt-0.5 shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="font-ui text-sm font-semibold">{v.label}</p>
          <p className="mt-0.5 font-ui text-sm text-ink">{q.feedback}</p>
        </div>
      </div>
      <div>
        <p className="mm-eyebrow mb-1">Reference answer</p>
        <p className="font-body text-[0.98rem] leading-relaxed whitespace-pre-wrap text-ink">{q.reference}</p>
      </div>
      <div className="border-l-2 border-line pl-3">
        <p className="mm-eyebrow mb-1">
          From{' '}
          {q.source.resourceId ? (
            <Link to={`/vault/${q.source.resourceId}`} className="underline-offset-2 hover:underline">
              {q.source.title}
            </Link>
          ) : (
            <span>{q.source.title || 'your library'} (deleted)</span>
          )}
          {q.source.page ? ` · page ${q.source.page}` : ''}
        </p>
        <p className="line-clamp-4 font-body text-sm leading-relaxed text-ink-muted library:italic">{q.source.excerpt}</p>
      </div>
      <p className="font-ui text-[0.72rem] text-ink-faint">Graded by AI against the passage above. It can be wrong, so trust your own judgement if you disagree.</p>
    </div>
  );
}

function Runner({ quiz, onUpdate }) {
  const toast = useToast();
  const firstOpen = quiz.questions.findIndex((q) => !q.verdict);
  const [current, setCurrent] = useState(firstOpen === -1 ? 0 : firstOpen);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const q = quiz.questions[current];

  const submit = async (e) => {
    e?.preventDefault();
    if (!text.trim()) return setError('Write an answer first');
    setSubmitting(true);
    setError(null);
    try {
      const { quiz: updated } = await quizApi.answer(quiz.id, current, text.trim());
      onUpdate(updated);
      setText('');
    } catch (err) {
      setError(err.message);
      if (err.status === 409) quizApi.get(quiz.id).then((d) => onUpdate(d.quiz)).catch(() => {});
    } finally {
      setSubmitting(false);
    }
    return undefined;
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex items-center justify-between font-ui text-xs text-ink-muted lab:font-mono lab:uppercase lab:tracking-wider">
        <span>
          Question {current + 1} of {quiz.total}
        </span>
        <span>{quiz.answered} answered</span>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-label="Quiz progress" aria-valuemin={0} aria-valuemax={quiz.total} aria-valuenow={quiz.answered}>
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${(quiz.answered / quiz.total) * 100}%` }} />
      </div>

      <div className="mm-card mm-card-ruled p-6 sm:p-8">
        <p className="font-display text-2xl leading-snug text-ink library:text-[1.9rem]">{q.question}</p>
        {q.verdict ? (
          <>
            <div className="mt-5 rounded-control bg-sunken p-3">
              <p className="mm-eyebrow mb-1">Your answer</p>
              <p className="font-ui text-sm whitespace-pre-wrap text-ink">{q.userAnswer}</p>
            </div>
            <Feedback q={q} />
          </>
        ) : (
          <form onSubmit={submit} className="mt-5" noValidate>
            <TextArea label="Your answer" rows={5} maxLength={2000} value={text} error={error} onChange={(e) => (setText(e.target.value), setError(null))} autoFocus placeholder="Explain it in your own words…" />
            <div className="mt-4 flex justify-end">
              <Button type="submit" loading={submitting} iconRight={ArrowRight}>
                {submitting ? 'Grading…' : 'Submit answer'}
              </Button>
            </div>
          </form>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" disabled={current === 0} onClick={() => (setCurrent((c) => c - 1), setError(null))}>
          Previous
        </Button>
        {q.verdict && current < quiz.total - 1 && (
          <Button iconRight={ArrowRight} onClick={() => (setCurrent((c) => c + 1), setText(''))}>
            Next question
          </Button>
        )}
        {q.verdict && current === quiz.total - 1 && quiz.status !== 'complete' && (
          <Button variant="secondary" onClick={() => setCurrent(quiz.questions.findIndex((x) => !x.verdict))}>
            Go to unanswered
          </Button>
        )}
      </div>
      {error && q.verdict && (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      )}
      {!q.verdict && error && <p className="sr-only">{error}</p>}
      <p className="mt-4 text-center font-ui text-xs text-ink-faint">Your progress is saved. You can leave and come back to this quiz from Recent quizzes.</p>
      {quiz.status === 'complete' && (
        <div className="mt-4 text-center">
          <Button onClick={() => toast.info('See the summary below')} className="hidden" />
        </div>
      )}
    </div>
  );
}

function Summary({ quiz, onNew, onChanged }) {
  const toast = useToast();
  const [making, setMaking] = useState(false);
  const missed = quiz.questions.filter((q) => q.verdict !== 'correct');

  const makeCards = async () => {
    setMaking(true);
    try {
      const res = await quizApi.makeFlashcards(quiz.id);
      toast.success(res.created ? `Added ${res.created} flashcard${res.created === 1 ? '' : 's'} to review` : res.message || 'Those cards already exist.');
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setMaking(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mm-card mm-card-ruled p-6 text-center sm:p-8">
        <p className="mm-eyebrow">Quiz complete</p>
        <p className="mt-2 font-display text-6xl text-ink lab:font-mono lab:text-5xl">{quiz.score}%</p>
        <p className="mt-2 font-ui text-sm text-ink-muted">
          {quiz.questions.filter((q) => q.verdict === 'correct').length} correct · {quiz.questions.filter((q) => q.verdict === 'partial').length} partly right · {quiz.questions.filter((q) => q.verdict === 'incorrect').length} missed
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {missed.length > 0 && (
            <Button icon={Layers} loading={making} disabled={quiz.flashcardsMade} onClick={makeCards}>
              {quiz.flashcardsMade ? 'Flashcards added' : `Make ${missed.length} flashcard${missed.length === 1 ? '' : 's'} to review`}
            </Button>
          )}
          {quiz.flashcardsMade && (
            <Button variant="secondary" to="/flashcards">
              Go to review
            </Button>
          )}
          <Button variant="secondary" icon={RotateCcw} onClick={onNew}>
            New quiz
          </Button>
        </div>
      </div>
      <ol className="mt-5 space-y-3">
        {quiz.questions.map((q, i) => {
          const v = VERDICT[q.verdict];
          return (
            <li key={i} className="mm-card p-4">
              <p className="flex items-start gap-2 font-ui text-sm font-semibold text-ink">
                <v.icon size={16} className={cn('mt-0.5 shrink-0', v.cls.split(' ')[0])} aria-label={v.label} />
                {q.question}
              </p>
              <p className="mt-2 font-ui text-xs text-ink-faint">Your answer</p>
              <p className="font-ui text-sm whitespace-pre-wrap text-ink-muted">{q.userAnswer}</p>
              <p className="mt-2 font-ui text-xs text-ink-faint">Reference</p>
              <p className="font-ui text-sm text-ink-muted">{q.reference}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function QuizPage() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const quizId = sp.get('id');
  const resourceId = sp.get('resource') || undefined;
  const [quiz, setQuiz] = useState(null);
  const [state, setState] = useState(quizId ? 'loading' : 'setup');
  const [error, setError] = useState(null);

  const load = useCallback(async (id) => {
    setState('loading');
    try {
      setQuiz((await quizApi.get(id)).quiz);
      setState('ready');
    } catch (err) {
      setError(err.message);
      setState('error');
    }
  }, []);

  useEffect(() => {
    if (quizId) load(quizId);
    else setState('setup');
  }, [quizId, load]);

  const open = (q, id) => {
    if (q) setQuiz(q);
    setSp({ id: q?.id || id }, { replace: false });
  };

  return (
    <>
      <PageHeader eyebrow={theme === 'library' ? 'The Study' : theme === 'lab' ? '01 / Core · test' : 'Learn'} title="Quiz me" description="Test your understanding of what you have saved, in your own words." />
      {state === 'loading' && <Skeleton className="h-72" />}
      {state === 'error' && (
        <Alert tone="error">
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} aria-hidden /> {error}
          </span>
          <button type="button" className="mt-2 underline" onClick={() => setSp({}, { replace: true })}>
            Back to quizzes
          </button>
        </Alert>
      )}
      {state === 'setup' && <Setup initialResource={resourceId} onStarted={open} />}
      {state === 'ready' && quiz && (quiz.status === 'complete' ? <Summary quiz={quiz} onNew={() => (setQuiz(null), navigate('/quiz'))} onChanged={() => load(quiz.id)} /> : <Runner key={quiz.id} quiz={quiz} onUpdate={setQuiz} />)}
    </>
  );
}
