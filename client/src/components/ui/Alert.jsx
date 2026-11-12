import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import { cn } from '../../lib/cn.js';

const TONES = {
  error: { icon: CircleAlert, cls: 'border-danger/30 bg-danger-soft text-danger' },
  success: { icon: CircleCheck, cls: 'border-success/30 bg-success-soft text-success' },
  info: { icon: Info, cls: 'border-line-strong bg-surface-2 text-ink-muted' },
};

export default function Alert({ tone = 'info', children, className }) {
  const { icon: Icon, cls } = TONES[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex items-start gap-2.5 rounded-control border px-3.5 py-3 font-ui text-sm', cls, className)}>
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
