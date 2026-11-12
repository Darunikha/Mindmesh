import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Brain, LibraryBig, Square } from 'lucide-react';
import { cn } from '../../lib/cn.js';

export const CHAT_MODES = [
  { value: 'general', label: 'General AI', short: 'General', icon: Brain, hint: "Answers from the model's general knowledge." },
  { value: 'knowledge', label: 'My Knowledge', short: 'Mine', icon: LibraryBig, hint: 'Searches your saved notes, documents and links, and cites them.' },
];

export function ModeSwitch({ mode, onChange, disabled }) {
  return (
    <div role="radiogroup" aria-label="Answer mode" className="inline-flex rounded-pill border border-line bg-surface-2 p-0.5">
      {CHAT_MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          role="radio"
          aria-checked={mode === m.value}
          disabled={disabled}
          onClick={() => onChange(m.value)}
          title={m.hint}
          className={cn(
            'flex items-center gap-1.5 rounded-pill px-3 py-1.5 font-ui text-xs font-semibold transition-colors disabled:opacity-60 lab:font-mono lab:text-[0.66rem] lab:uppercase lab:tracking-wider',
            mode === m.value ? 'bg-accent text-accent-ink shadow-sm' : 'text-ink-muted hover:text-ink'
          )}
        >
          <m.icon size={13} aria-hidden />
          {m.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Message input. Enter sends, Shift+Enter adds a line. While an answer streams, the send
 * button becomes Stop and new submissions are blocked (the server also enforces this).
 */
export default function Composer({ onSend, onStop, streaming, disabled, mode, onModeChange, placeholder, initialValue = '' }) {
  const [value, setValue] = useState(initialValue);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [value]);

  const submit = () => {
    const text = value.trim();
    if (!text || streaming || disabled) return;
    onSend(text);
    setValue('');
  };

  return (
    <div
      className={cn(
        'mm-card p-2',
        'studio:rounded-[24px]',
        'lab:border-line-strong lab:bg-bg-elev'
      )}
    >
      <label htmlFor="chat-input" className="sr-only">
        Message
      </label>
      <textarea
        id="chat-input"
        ref={ref}
        rows={1}
        value={value}
        maxLength={12000}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        className="block max-h-60 w-full resize-none bg-transparent px-3 py-2.5 font-ui text-[0.98rem] text-ink outline-none placeholder:text-ink-faint disabled:cursor-not-allowed library:font-body"
      />
      <div className="flex items-center justify-between gap-2 px-1 pt-1">
        <ModeSwitch mode={mode} onChange={onModeChange} disabled={disabled} />
        <div className="flex items-center gap-2">
          <span className="hidden font-ui text-[0.7rem] text-ink-faint sm:inline">Shift+Enter for a new line</span>
          {streaming ? (
            <button type="button" onClick={onStop} className="mm-btn mm-btn-secondary mm-btn-icon" aria-label="Stop generating" title="Stop generating">
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={!value.trim() || disabled} className="mm-btn mm-btn-primary mm-btn-icon" aria-label="Send message" title="Send (Enter)">
              <ArrowUp size={17} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
