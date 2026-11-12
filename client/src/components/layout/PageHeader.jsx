import { cn } from '../../lib/cn.js';

export default function PageHeader({ eyebrow, title, description, actions, className }) {
  return (
    <header className={cn('mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="mm-eyebrow mb-2">{eyebrow}</p>}
        <h1 className="mm-display text-4xl text-ink library:text-5xl lab:text-3xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl font-ui text-[0.95rem] text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
