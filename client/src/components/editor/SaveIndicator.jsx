import { useEffect, useState } from 'react';
import { AlertTriangle, Check, CloudOff, Loader2, PencilLine } from 'lucide-react';
import { relativeTime } from '../../lib/format.js';
import { cn } from '../../lib/cn.js';

/** Live, screen-reader-announced autosave status. */
export default function SaveIndicator({ state, lastSavedAt, onRetry }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, []);

  const view = {
    saved: { icon: Check, text: lastSavedAt ? `Saved ${relativeTime(lastSavedAt)}` : 'All changes saved', cls: 'text-ink-faint' },
    dirty: { icon: PencilLine, text: 'Unsaved changes', cls: 'text-ink-muted' },
    saving: { icon: Loader2, text: 'Saving…', cls: 'text-ink-muted', spin: true },
    error: { icon: CloudOff, text: 'Not saved', cls: 'text-danger' },
    conflict: { icon: AlertTriangle, text: 'Edited elsewhere', cls: 'text-danger' },
  }[state];
  const Icon = view.icon;

  return (
    <span className={cn('inline-flex items-center gap-1.5 font-ui text-xs lab:font-mono lab:text-[0.68rem] lab:uppercase lab:tracking-wider', view.cls)} role="status" aria-live="polite">
      <Icon size={13} className={view.spin ? 'animate-spin' : undefined} aria-hidden />
      {view.text}
      {state === 'error' && onRetry && (
        <button type="button" onClick={onRetry} className="underline underline-offset-2">
          Retry
        </button>
      )}
    </span>
  );
}
