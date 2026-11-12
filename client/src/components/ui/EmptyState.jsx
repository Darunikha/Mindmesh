import { cn } from '../../lib/cn.js';

/** Friendly empty state with an icon, explanation and an optional action. */
export default function EmptyState({ icon: Icon, title, children, action, className, compact }) {
  return (
    <div className={cn('flex flex-col items-center text-center', compact ? 'px-4 py-6' : 'px-6 py-10', className)}>
      {Icon && (
        <div
          className={cn(
            'mb-4 flex h-12 w-12 items-center justify-center text-accent',
            'library:rounded-full library:border library:border-line-strong library:bg-surface-2',
            'studio:rounded-2xl studio:bg-accent-soft',
            'lab:rounded-[8px] lab:border lab:border-line-strong lab:bg-accent-soft'
          )}
        >
          <Icon size={22} aria-hidden />
        </div>
      )}
      <h4 className="text-lg text-ink library:text-xl">{title}</h4>
      {children && <p className="mt-1.5 max-w-sm font-ui text-sm text-ink-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
