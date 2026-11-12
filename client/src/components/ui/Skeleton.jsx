import { cn } from '../../lib/cn.js';

export default function Skeleton({ className, lines }) {
  if (lines) {
    return (
      <div className="space-y-2" aria-hidden>
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className={cn('mm-skeleton h-3.5', i === lines - 1 && 'w-2/3', className)} />
        ))}
      </div>
    );
  }
  return <div className={cn('mm-skeleton', className)} aria-hidden />;
}
