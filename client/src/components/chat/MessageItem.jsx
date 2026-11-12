import { memo, useState } from 'react';
import { AlertTriangle, BookOpenCheck, Brain, Check, Copy, Info, LibraryBig, Loader2, RotateCcw, Search, Square } from 'lucide-react';
import Markdown from './Markdown.jsx';
import SourceCards from './SourceCards.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { formatDate } from '../../lib/format.js';
import { cn } from '../../lib/cn.js';

function GroundingBadge({ message }) {
  const citedCount = message.citations.filter((c) => c.cited).length;
  let icon = Brain;
  let label = 'General AI';
  let cls = 'text-ink-muted';
  if (message.mode === 'knowledge') {
    if (message.kind === 'notice') {
      icon = Info;
      label = 'My Knowledge · no sources yet';
    } else if (citedCount) {
      icon = BookOpenCheck;
      label = `Grounded in ${citedCount} of your source${citedCount === 1 ? '' : 's'}`;
      cls = 'text-success';
    } else if (message.retrieval?.searched) {
      icon = LibraryBig;
      label = message.retrieval.found ? 'My Knowledge · sources searched, none cited' : 'My Knowledge · no matching sources';
      cls = 'text-ink-muted';
    } else {
      icon = LibraryBig;
      label = 'My Knowledge';
    }
  }
  const Icon = icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-ui text-[0.74rem] font-medium lab:font-mono lab:text-[0.66rem] lab:uppercase lab:tracking-wider', cls)}>
      <Icon size={13} aria-hidden />
      {label}
    </span>
  );
}

function PhaseIndicator({ phase, sourcesFound }) {
  const map = {
    searching: { icon: Search, text: 'Searching your library…' },
    thinking: { icon: Loader2, text: sourcesFound != null ? `Found ${sourcesFound} passage${sourcesFound === 1 ? '' : 's'} · thinking…` : 'Thinking…', spin: true },
  };
  const v = map[phase] || map.thinking;
  return (
    <p className="flex items-center gap-2 font-ui text-sm text-ink-muted lab:font-mono lab:text-xs" role="status">
      <v.icon size={15} className={v.spin ? 'animate-spin text-accent' : 'text-accent'} aria-hidden />
      {v.text}
    </p>
  );
}

function ActionButton({ icon: Icon, label, onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex h-7 items-center gap-1 rounded-control px-2 font-ui text-xs text-ink-faint transition-colors hover:bg-sunken hover:text-ink', active && 'text-success')}
      aria-label={label}
      title={label}
    >
      <Icon size={13} aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/** One chat message. Assistant messages carry grounding info, citations and actions. */
function MessageItem({ message, streaming, phase, isLast, onRegenerate, onFollowUp, canRegenerate }) {
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);
  const [highlight, setHighlight] = useState(null);
  const time = formatDate(message.createdAt, { hour: '2-digit', minute: '2-digit' });

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div
          className={cn(
            'max-w-[85%] sm:max-w-[75%]',
            'library:rounded-[4px] library:border library:border-line-strong library:bg-surface library:px-4 library:py-3 library:shadow-card',
            'studio:rounded-[22px] studio:rounded-br-[6px] studio:bg-accent studio:px-4 studio:py-2.5 studio:text-accent-ink',
            'lab:w-full lab:max-w-none lab:border-l-2 lab:border-accent-2 lab:bg-accent-2-soft lab:px-4 lab:py-2.5'
          )}
        >
          {theme === 'lab' && <p className="mb-1 font-mono text-[0.62rem] tracking-[0.14em] text-accent-2 uppercase">› query · {time}</p>}
          <p className="font-ui text-[0.95rem] leading-relaxed break-words whitespace-pre-wrap library:font-body library:text-[1.02rem]">{message.content}</p>
          {theme !== 'lab' && (
            <p className={cn('mt-1 text-right font-ui text-[0.68rem]', theme === 'studio' ? 'text-accent-ink/70' : 'text-ink-faint')}>
              <time dateTime={message.createdAt}>{time}</time>
            </p>
          )}
        </div>
      </div>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const onCite = (n) => {
    setHighlight(null);
    requestAnimationFrame(() => {
      setHighlight(n);
      document.getElementById(`cite-${message.id}-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const showPhase = streaming && !message.content;
  const failed = message.status === 'error';

  return (
    <article
      className={cn(
        'group/msg',
        'library:border-l library:border-line-strong library:pl-5',
        'studio:rounded-[20px] studio:bg-surface studio:p-5 studio:shadow-card',
        'lab:border-l-2 lab:border-accent lab:pl-4'
      )}
      aria-busy={streaming || undefined}
    >
      <header className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <GroundingBadge message={message} />
        {theme === 'lab' && message.model && <span className="font-mono text-[0.62rem] text-ink-faint">{message.model}</span>}
        {message.retrieval?.strategy && theme === 'lab' && <span className="font-mono text-[0.62rem] text-ink-faint">{message.retrieval.strategy}</span>}
        <time dateTime={message.createdAt} className="ml-auto font-ui text-[0.7rem] text-ink-faint lab:font-mono">
          {time}
        </time>
      </header>

      {message.retrieval?.note && message.retrieval.note !== 'EMPTY_LIBRARY' && (
        <p className="mb-2 flex items-start gap-1.5 font-ui text-xs text-ink-faint">
          <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
          {message.retrieval.note}
        </p>
      )}

      {showPhase ? (
        <PhaseIndicator phase={phase} sourcesFound={message.retrieval?.searched ? message.retrieval.found : null} />
      ) : (
        <div className={cn(message.kind === 'notice' && 'rounded-card border border-dashed border-line-strong bg-surface-2 p-4')}>
          <Markdown text={message.content} citations={message.citations} onCite={onCite} />
          {streaming && <span className="mm-caret" aria-hidden />}
        </div>
      )}

      {message.truncated && <p className="mt-2 font-ui text-xs text-ink-faint">The answer reached the length limit and was cut short.</p>}
      {message.status === 'stopped' && <p className="mt-2 flex items-center gap-1 font-ui text-xs text-ink-faint"><Square size={11} aria-hidden /> Stopped</p>}
      {message.status === 'refused' && <p className="mt-2 font-ui text-xs text-ink-muted">The model declined to answer this request.</p>}
      {failed && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-control border border-danger/30 bg-danger-soft px-3 py-2 font-ui text-sm text-danger">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span className="flex-1">{message.error || 'Something went wrong while generating this answer.'}</span>
          {canRegenerate && (
            <button type="button" onClick={onRegenerate} className="shrink-0 font-semibold underline underline-offset-2">
              Retry
            </button>
          )}
        </div>
      )}

      {!streaming && <SourceCards messageId={message.id} citations={message.citations} highlighted={highlight} />}

      {!streaming && message.kind !== 'notice' && message.content && (
        <div className="mt-3 flex flex-wrap items-center gap-1 opacity-100 sm:opacity-60 sm:group-hover/msg:opacity-100 sm:focus-within:opacity-100">
          <ActionButton icon={copied ? Check : Copy} label={copied ? 'Copied' : 'Copy'} onClick={copy} active={copied} />
          {canRegenerate && !failed && <ActionButton icon={RotateCcw} label="Regenerate" onClick={onRegenerate} />}
        </div>
      )}

      {isLast && !streaming && message.followUps?.length > 0 && (
        <div className="mt-4">
          <p className="mm-eyebrow mb-2">Ask next</p>
          <div className="flex flex-wrap gap-2">
            {message.followUps.map((f) => (
              <button key={f} type="button" className="mm-chip text-left" onClick={() => onFollowUp(f)}>
                {f}
              </button>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

export default memo(MessageItem);
