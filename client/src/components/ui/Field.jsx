import { forwardRef, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib/cn.js';

function FieldShell({ id, label, hint, error, children, className, optional }) {
  return (
    <div className={cn('min-w-0', className)}>
      {label && (
        <label htmlFor={id} className="mm-label">
          {label}
          {optional && <span className="ml-1.5 font-normal text-ink-faint normal-case tracking-normal">optional</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 font-ui text-[0.8rem] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 font-ui text-[0.8rem] text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id, error, hint) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

export const TextField = forwardRef(function TextField(
  { label, hint, error, className, inputClassName, type = 'text', optional, ...rest },
  ref
) {
  const autoId = useId();
  const id = rest.id || autoId;
  const [reveal, setReveal] = useState(false);
  const isPassword = type === 'password';

  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className} optional={optional}>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={isPassword && reveal ? 'text' : type}
          className={cn('mm-input', isPassword && 'pr-11', inputClassName)}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy(id, error, hint)}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-faint hover:text-ink"
            aria-label={reveal ? 'Hide password' : 'Show password'}
            aria-pressed={reveal}
          >
            {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
    </FieldShell>
  );
});

export const TextArea = forwardRef(function TextArea({ label, hint, error, className, optional, ...rest }, ref) {
  const autoId = useId();
  const id = rest.id || autoId;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className} optional={optional}>
      <textarea
        ref={ref}
        id={id}
        className="mm-input"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...rest}
      />
    </FieldShell>
  );
});

export const SelectField = forwardRef(function SelectField({ label, hint, error, className, options, ...rest }, ref) {
  const autoId = useId();
  const id = rest.id || autoId;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <select
        ref={ref}
        id={id}
        className="mm-input"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
});
