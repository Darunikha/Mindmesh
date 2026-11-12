import { Check } from 'lucide-react';
import { cn } from '../../lib/cn.js';

/** Accessible single-select radio cards. options: [{ value, label, description, icon }] */
export default function ChoiceCards({ value, onChange, options, label, columns = 3 }) {
  const onKeyDown = (e, idx) => {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    const next = options[(idx + dir + options.length) % options.length];
    onChange(next.value);
    e.currentTarget.parentElement?.children[(idx + dir + options.length) % options.length]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('grid gap-3', columns === 3 && 'sm:grid-cols-3', columns === 2 && 'sm:grid-cols-2')}
    >
      {options.map((o, idx) => {
        const selected = value === o.value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (!value && idx === 0) ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, idx)}
            className={cn(
              'relative flex flex-col items-start gap-2 rounded-card border p-4 text-left transition-all',
              selected ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-line-strong'
            )}
          >
            <div className="flex w-full items-center justify-between">
              {Icon && <Icon size={18} className={selected ? 'text-accent' : 'text-ink-muted'} aria-hidden />}
              <span
                className={cn(
                  'flex h-4.5 w-4.5 items-center justify-center rounded-full border',
                  selected ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong'
                )}
                aria-hidden
              >
                {selected && <Check size={11} strokeWidth={3} />}
              </span>
            </div>
            <span className="font-ui text-[0.95rem] font-semibold text-ink">{o.label}</span>
            {o.description && <span className="font-ui text-[0.82rem] leading-snug text-ink-muted">{o.description}</span>}
          </button>
        );
      })}
    </div>
  );
}
