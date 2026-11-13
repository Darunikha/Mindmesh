import { useEffect, useState } from 'react';
import Dialog from '../ui/Dialog.jsx';
import Button from '../ui/Button.jsx';
import Alert from '../ui/Alert.jsx';
import { TextArea } from '../ui/Field.jsx';
import { flashcardsApi } from '../../api/chat.js';
import { useToast } from '../../context/ToastContext.jsx';

/** Create or edit a flashcard. `resourceId` attaches new cards to an item. */
export default function CardDialog({ open, onClose, card, resourceId, onSaved }) {
  const toast = useToast();
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFront(card?.front || '');
    setBack(card?.back || '');
    setErrors({});
    setError(null);
  }, [open, card]);

  const submit = async (e, another = false) => {
    e?.preventDefault();
    const next = { front: front.trim() ? undefined : 'Write a question or prompt', back: back.trim() ? undefined : 'Write the answer' };
    if (next.front || next.back) return setErrors(next);
    setSaving(true);
    setError(null);
    try {
      const res = card ? await flashcardsApi.update(card.id, { front: front.trim(), back: back.trim() }) : await flashcardsApi.create({ front: front.trim(), back: back.trim(), resourceId: resourceId || null });
      onSaved?.(res.card);
      toast.success(card ? 'Card updated' : 'Card added');
      if (another && !card) {
        setFront('');
        setBack('');
      } else onClose();
    } catch (err) {
      setErrors(err.fields || {});
      if (!Object.keys(err.fields || {}).length) setError(err.message);
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  return (
    <Dialog open={open} onClose={onClose} title={card ? 'Edit card' : 'New flashcard'} description="One idea per card works best: a clear question on the front, a short answer on the back.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <TextArea label="Front (question)" rows={3} maxLength={1000} value={front} error={errors.front} onChange={(e) => setFront(e.target.value)} autoFocus />
        <TextArea label="Back (answer)" rows={4} maxLength={4000} value={back} error={errors.back} onChange={(e) => setBack(e.target.value)} />
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {!card && (
            <Button variant="secondary" loading={saving} onClick={(e) => submit(e, true)}>
              Save and add another
            </Button>
          )}
          <Button type="submit" loading={saving}>
            {card ? 'Save' : 'Add card'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
