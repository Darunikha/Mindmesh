import { cn } from '../../lib/cn.js';

export default function Card({ as: Tag = 'div', ruled, interactive, className, children, ...rest }) {
  return (
    <Tag className={cn('mm-card', ruled && 'mm-card-ruled', interactive && 'mm-card-interactive', className)} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHeader({ eyebrow, title, action, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="mm-eyebrow mb-1">{eyebrow}</p>}
        {title && <h3 className="text-xl text-ink library:text-2xl">{title}</h3>}
      </div>
      {action}
    </div>
  );
}
