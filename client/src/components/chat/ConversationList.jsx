import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Check, MessageSquarePlus, Pencil, Search, Trash2, X } from 'lucide-react';
import Button from '../ui/Button.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import { cn } from '../../lib/cn.js';

function groupLabel(date) {
  const d = new Date(date);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = (start - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000;
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return 'Previous 7 days';
  if (diff < 30) return 'Previous 30 days';
  return 'Older';
}

function Row({ c, onRename, onDelete, onNavigate }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(c.title);

  const save = async (e) => {
    e.preventDefault();
    const t = title.trim();
    if (t && t !== c.title) await onRename(c.id, t);
    setEditing(false);
  };

  if (editing) {
    return (
      <form onSubmit={save} className="flex items-center gap-1 px-1 py-1">
        <label htmlFor={`rename-${c.id}`} className="sr-only">
          Conversation title
        </label>
        <input id={`rename-${c.id}`} autoFocus value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setEditing(false)} className="mm-input !min-h-8 !py-1 text-sm" />
        <button type="submit" className="rounded p-1 text-ink-muted hover:text-ink" aria-label="Save title">
          <Check size={14} />
        </button>
        <button type="button" onClick={() => setEditing(false)} className="rounded p-1 text-ink-muted hover:text-ink" aria-label="Cancel">
          <X size={14} />
        </button>
      </form>
    );
  }

  return (
    <div className="group relative">
      <NavLink
        to={`/assistant/${c.id}`}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            'block truncate rounded-control py-2 pr-16 pl-3 font-ui text-sm transition-colors',
            isActive ? 'bg-accent-soft font-semibold text-ink' : 'text-ink-muted hover:bg-sunken hover:text-ink'
          )
        }
      >
        {c.generating && <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent align-middle" aria-label="Generating" />}
        {c.title}
      </NavLink>
      <div className="absolute top-1/2 right-1 flex -translate-y-1/2 gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <button type="button" onClick={() => setEditing(true)} className="rounded p-1 text-ink-faint hover:bg-surface hover:text-ink" aria-label={`Rename ${c.title}`}>
          <Pencil size={13} />
        </button>
        <button type="button" onClick={() => onDelete(c)} className="rounded p-1 text-ink-faint hover:bg-surface hover:text-danger" aria-label={`Delete ${c.title}`}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

export default function ConversationList({ conversations, loading, onNew, onRename, onDelete, onNavigate }) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const list = (conversations || []).filter((c) => !q || c.title.toLowerCase().includes(q.toLowerCase()));
    const out = [];
    for (const c of list) {
      const label = groupLabel(c.lastMessageAt);
      if (!out.length || out.at(-1).label !== label) out.push({ label, items: [] });
      out.at(-1).items.push(c);
    }
    return out;
  }, [conversations, q]);

  return (
    <div className="flex h-full flex-col">
      <Button icon={MessageSquarePlus} onClick={onNew} className="w-full">
        New chat
      </Button>
      <div className="relative mt-3">
        <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint" aria-hidden />
        <label htmlFor="chat-search" className="sr-only">
          Search conversations
        </label>
        <input id="chat-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" className="mm-input !min-h-9 !py-1 !pl-8 text-sm" />
      </div>
      <nav aria-label="Conversations" className="mt-3 -mr-2 min-h-0 flex-1 space-y-4 overflow-y-auto pr-2">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : groups.length === 0 ? (
          <p className="px-1 font-ui text-xs text-ink-faint">{q ? 'No chats match.' : 'Your conversations will appear here.'}</p>
        ) : (
          groups.map((g) => (
            <div key={g.label}>
              <p className="mm-eyebrow mb-1 px-1">{g.label}</p>
              <div className="space-y-0.5">
                {g.items.map((c) => (
                  <Row key={c.id} c={c} onRename={onRename} onDelete={onDelete} onNavigate={onNavigate} />
                ))}
              </div>
            </div>
          ))
        )}
      </nav>
    </div>
  );
}
