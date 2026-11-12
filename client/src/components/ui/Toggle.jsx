import { useId } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/cn.js';

/** Accessible switch with label and description. */
export default function Toggle({ checked, onChange, label, description, disabled }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-6 py-1">
      <div className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer font-ui text-[0.95rem] font-semibold text-ink">
          {label}
        </label>
        {description && <p className="mt-0.5 font-ui text-sm text-ink-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          'lab:rounded-[6px] library:rounded-[4px]',
          checked ? 'border-accent bg-accent' : 'border-line-strong bg-sunken'
        )}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 600, damping: 35 }}
          className={cn(
            'mx-[3px] block h-4 w-4 rounded-full shadow-sm lab:rounded-[3px] library:rounded-[2px]',
            checked ? 'ml-auto bg-accent-ink' : 'bg-ink-faint'
          )}
        />
      </button>
    </div>
  );
}
