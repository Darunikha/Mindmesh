import { AlertTriangle, Check, Loader2, Clock } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext.jsx';
import { cn } from '../../lib/cn.js';
import { TYPE_ICONS, TYPE_LABELS, TYPE_TINT } from './resourceMeta.js';

export function TypeBadge({ type, className, withIcon = true }) {
  const { theme } = useTheme();
  const Icon = TYPE_ICONS[type];
  const tint = TYPE_TINT[type];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap',
        'library:font-display library:text-[0.82rem] library:font-semibold library:tracking-[0.14em] library:lowercase library:[font-variant:small-caps]',
        'studio:rounded-full studio:px-2 studio:py-0.5 studio:font-ui studio:text-[0.72rem] studio:font-semibold',
        theme === 'studio' && tint.bg,
        'lab:font-mono lab:text-[0.66rem] lab:tracking-[0.14em]',
        tint.fg,
        className
      )}
    >
      {withIcon && theme !== 'library' && <Icon size={theme === 'lab' ? 11 : 12} aria-hidden />}
      {TYPE_LABELS[theme][type]}
    </span>
  );
}

const STATUS = {
  pending: { label: 'Queued', icon: Clock, cls: 'text-ink-muted' },
  processing: { label: 'Processing', icon: Loader2, cls: 'text-accent', spin: true },
  failed: { label: 'Failed', icon: AlertTriangle, cls: 'text-danger' },
  ready: { label: 'Indexed', icon: Check, cls: 'text-success' },
};

/** Processing status. Hidden for "ready" unless `showReady`, to keep cards calm. */
export function StatusBadge({ resource, showReady = false, className }) {
  const { theme } = useTheme();
  const status = resource.processing?.status || 'ready';
  if (status === 'ready' && !showReady) return null;
  const restricted = status === 'failed' && resource.processing?.code === 'ROBOTS_DISALLOWED';
  const s = restricted ? { label: 'Bookmark only', icon: AlertTriangle, cls: 'text-ink-muted' } : STATUS[status];
  const Icon = s.icon;
  return (
    <span
      className={cn('inline-flex items-center gap-1 font-ui text-[0.74rem] font-medium', theme === 'lab' && 'font-mono text-[0.66rem] tracking-wider uppercase', s.cls, className)}
      title={resource.processing?.error || undefined}
      role="status"
    >
      {theme === 'lab' ? (
        <span className={cn('h-1.5 w-1.5 rounded-full bg-current', s.spin && 'animate-pulse')} aria-hidden />
      ) : (
        <Icon size={12} className={s.spin ? 'animate-spin' : undefined} aria-hidden />
      )}
      {s.label}
    </span>
  );
}
