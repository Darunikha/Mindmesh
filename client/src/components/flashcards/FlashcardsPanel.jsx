import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap, Plus, Sparkles } from 'lucide-react';
import Card from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import CardDialog from './CardDialog.jsx';
import { flashcardsApi } from '../../api/chat.js';
import { useToast } from '../../context/ToastContext.jsx';

/** Flashcards for one item: count, AI generation, manual add and a shortcut to review them. */
export default function FlashcardsPanel({ resource }) {
  const toast = useToast();
  const [count, setCount] = useState(null);
  const [due, setDue] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [adding, setAdding] = useState(false);
  const canGenerate = resource.processing?.status === 'ready' && resource.processing?.chunkCount > 0;

  const load = useCallback(async () => {
    try {
      const [all, dueRes] = await Promise.all([flashcardsApi.list({ resourceId: resource.id, limit: 1 }), flashcardsApi.list({ resourceId: resource.id, status: 'due', limit: 1 })]);
      setCount(all.total);
      setDue(dueRes.total);
    } catch {
      setCount(0);
    }
  }, [resource.id]);

  useEffect(() => {
    load();
  }, [load]);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await flashcardsApi.generate(resource.id, 8);
      toast.success(res.cards.length ? `Added ${res.cards.length} card${res.cards.length === 1 ? '' : 's'}${res.skipped ? ` (${res.skipped} duplicate${res.skipped === 1 ? '' : 's'} skipped)` : ''}` : 'No new cards: the questions already exist.');
      load();
    } catch (err) {
      toast.error(err.code === 'AI_NOT_CONFIGURED' ? 'Card generation needs the AI assistant to be configured on the server. You can still add cards by hand.' : err.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="mm-eyebrow">Flashcards</p>
        {count > 0 && (
          <Link to={`/flashcards?resource=${resource.id}&tab=cards`} className="font-ui text-xs text-ink-muted hover:text-accent">
            {count} card{count === 1 ? '' : 's'}
          </Link>
        )}
      </div>
      {count === 0 && <p className="mb-3 font-ui text-xs text-ink-muted">Turn this item into questions you review over time.</p>}
      <div className="flex flex-col gap-2">
        {due > 0 && (
          <Button size="sm" icon={GraduationCap} to={`/flashcards?resource=${resource.id}`}>
            Review {due} due
          </Button>
        )}
        <Button size="sm" variant="secondary" icon={Sparkles} loading={generating} disabled={!canGenerate} onClick={generate} title={canGenerate ? undefined : 'Available once the text has been extracted'}>
          Generate cards
        </Button>
        <Button size="sm" variant="ghost" icon={Plus} onClick={() => setAdding(true)}>
          Add a card
        </Button>
      </div>
      <CardDialog open={adding} resourceId={resource.id} onClose={() => setAdding(false)} onSaved={load} />
    </Card>
  );
}
