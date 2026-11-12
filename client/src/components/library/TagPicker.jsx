import { useId, useMemo, useRef, useState } from 'react';
import { Plus, Tag as TagIcon, X } from 'lucide-react';
import { useLibrary } from '../../context/LibraryContext.jsx';
import { cn } from '../../lib/cn.js';

/**
 * Tag combobox: shows selected tags as removable chips, suggests existing tags while typing,
 * and creates a new tag on Enter. Works with tag *names*; the API resolves them.
 */
export default function TagPicker({ value, onChange, label = 'Tags', max = 20, compact }) {
  const { tags } = useLibrary();
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listId = useId();
  const inputId = useId();

  const lowerSelected = value.map((v) => v.toLowerCase());
  const suggestions = useMemo(() => {
    const q = draft.trim().toLowerCase();
    return (tags || [])
      .filter((t) => !lowerSelected.includes(t.name.toLowerCase()))
      .filter((t) => !q || t.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [tags, draft, lowerSelected]);

  const exact = suggestions.some((s) => s.name.toLowerCase() === draft.trim().toLowerCase());
  const options = [...suggestions.map((s) => ({ name: s.name, existing: true })), ...(draft.trim() && !exact && !lowerSelected.includes(draft.trim().toLowerCase()) ? [{ name: draft.trim().slice(0, 40), existing: false }] : [])];

  const add = (name) => {
    if (!name || lowerSelected.includes(name.toLowerCase()) || value.length >= max) return;
    onChange([...value, name]);
    setDraft('');
    setActive(0);
  };
  const remove = (name) => onChange(value.filter((v) => v !== name));

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' || e.key === ',') {
      if (!draft.trim() && e.key === 'Enter') return;
      e.preventDefault();
      add(options[active]?.name || draft.trim());
    } else if (e.key === 'Backspace' && !draft && value.length) {
      remove(value[value.length - 1]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      {label && (
        <label htmlFor={inputId} className="mm-label">
          {label}
        </label>
      )}
      <div
        className={cn('mm-input flex min-h-[2.75rem] flex-wrap items-center gap-1.5 !py-1.5', compact && '!min-h-[2.5rem]')}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((name) => (
          <span key={name} className="mm-chip !py-0.5" aria-pressed="true">
            {name}
            <button type="button" onClick={() => remove(name)} className="-mr-1 rounded-full p-0.5 hover:bg-surface" aria-label={`Remove tag ${name}`}>
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={inputId}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          placeholder={value.length ? '' : 'Add tags…'}
          className="min-w-[6rem] flex-1 bg-transparent py-1 font-ui text-sm outline-none placeholder:text-ink-faint"
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          maxLength={40}
          disabled={value.length >= max}
        />
      </div>
      {open && options.length > 0 && (
        <ul id={listId} role="listbox" className="mm-card absolute z-40 mt-1 max-h-60 w-full overflow-auto p-1 shadow-raised">
          {options.map((o, i) => (
            <li
              key={`${o.existing}-${o.name}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                add(o.name);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn('flex cursor-pointer items-center gap-2 rounded-control px-2.5 py-1.5 font-ui text-sm', i === active ? 'bg-accent-soft text-ink' : 'text-ink-muted')}
            >
              {o.existing ? <TagIcon size={13} aria-hidden /> : <Plus size={13} aria-hidden />}
              {o.existing ? o.name : `Create "${o.name}"`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
