import { cn } from '../../lib/cn.js';

/** Click handler for an item link: in select mode it toggles the item instead of opening it. */
export const selectClick = (select, id) =>
  select?.active
    ? (e) => {
        e.preventDefault();
        select.toggle(id);
      }
    : undefined;

/** A real checkbox, sized for touch, laid over the corner of a card or row. */
export default function SelectBox({ select, id, title, className }) {
  if (!select?.active) return null;
  return (
    <label className={cn('absolute z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-control bg-surface/95 shadow-card', className)}>
      <input type="checkbox" checked={select.has(id)} onChange={() => select.toggle(id)} className="h-[1.15rem] w-[1.15rem] cursor-pointer accent-[var(--mm-accent)]" aria-label={`Select ${title}`} />
    </label>
  );
}
