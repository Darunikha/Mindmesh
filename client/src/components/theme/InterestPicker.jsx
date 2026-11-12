import { useState } from 'react';
import { Plus, X } from 'lucide-react';

export const SUGGESTED_TOPICS = [
  'Machine learning',
  'Philosophy',
  'Software engineering',
  'History',
  'Design',
  'Neuroscience',
  'Economics',
  'Writing',
  'Physics',
  'Product strategy',
  'Languages',
  'Psychology',
  'Climate',
  'Mathematics',
  'Music theory',
  'Biology',
];

const MAX = 12;

/** Toggleable topic chips plus a free-text input for custom topics. */
export default function InterestPicker({ value, onChange }) {
  const [draft, setDraft] = useState('');
  const has = (t) => value.some((v) => v.toLowerCase() === t.toLowerCase());
  const custom = value.filter((v) => !SUGGESTED_TOPICS.some((s) => s.toLowerCase() === v.toLowerCase()));

  const toggle = (t) => {
    if (has(t)) onChange(value.filter((v) => v.toLowerCase() !== t.toLowerCase()));
    else if (value.length < MAX) onChange([...value, t]);
  };

  const addDraft = (e) => {
    e.preventDefault();
    const t = draft.trim().slice(0, 40);
    if (!t || has(t) || value.length >= MAX) return;
    onChange([...value, t]);
    setDraft('');
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {SUGGESTED_TOPICS.map((t) => (
          <button key={t} type="button" className="mm-chip" aria-pressed={has(t)} onClick={() => toggle(t)} disabled={!has(t) && value.length >= MAX}>
            {t}
          </button>
        ))}
        {custom.map((t) => (
          <button key={t} type="button" className="mm-chip" aria-pressed="true" onClick={() => toggle(t)} aria-label={`Remove ${t}`}>
            {t}
            <X size={12} aria-hidden />
          </button>
        ))}
      </div>
      <form onSubmit={addDraft} className="mt-4 flex gap-2">
        <label htmlFor="custom-topic" className="sr-only">
          Add your own topic
        </label>
        <input
          id="custom-topic"
          className="mm-input"
          placeholder="Add your own topic…"
          value={draft}
          maxLength={40}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="mm-btn mm-btn-secondary shrink-0" disabled={!draft.trim() || value.length >= MAX}>
          <Plus size={16} aria-hidden />
          Add
        </button>
      </form>
      <p className="mt-2 font-ui text-xs text-ink-faint">
        {value.length}/{MAX} selected
      </p>
    </div>
  );
}
