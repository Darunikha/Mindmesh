import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleSlash, RefreshCw } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card.jsx';
import ChoiceCards from '../../components/ui/ChoiceCards.jsx';
import Toggle from '../../components/ui/Toggle.jsx';
import Button from '../../components/ui/Button.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import Dialog from '../../components/ui/Dialog.jsx';
import { SelectField } from '../../components/ui/Field.jsx';
import { usePreferences } from '../../hooks/usePreferences.js';
import { useToast } from '../../context/ToastContext.jsx';
import { aiApi } from '../../api/chat.js';
import { ANSWER_MODE_OPTIONS, normalizeMode } from '../../lib/aiModes.js';

const STYLES = [
  { value: 'concise', label: 'Concise: short, direct answers' },
  { value: 'balanced', label: 'Balanced: explanation where it helps' },
  { value: 'detailed', label: 'Detailed: thorough, step-by-step' },
];

function Row({ label, ok, children }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-2.5 last:border-0">
      <dt className="font-ui text-sm text-ink-muted">{label}</dt>
      <dd className="flex items-center gap-1.5 text-right font-ui text-sm text-ink lab:font-mono lab:text-xs">
        {ok === true && <CheckCircle2 size={14} className="text-success" aria-hidden />}
        {ok === false && <CircleSlash size={14} className="text-ink-faint" aria-hidden />}
        {children}
      </dd>
    </div>
  );
}

function AiStatus() {
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmForce, setConfirmForce] = useState(false);

  const load = useCallback(() => aiApi.status().then(setStatus).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);

  // While anything is being indexed, refresh the counts every few seconds.
  const working = (status?.index?.byStatus?.pending || 0) + (status?.index?.byStatus?.processing || 0);
  useEffect(() => {
    if (!working) return undefined;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [working, load]);

  const reindex = async (force) => {
    setBusy(true);
    setConfirmForce(false);
    try {
      const res = await aiApi.reindex(force);
      toast.success(`Queued ${res.queued} item${res.queued === 1 ? '' : 's'} for indexing.`);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="font-ui text-sm text-danger">{error}</p>;
  if (!status) return <Skeleton lines={4} />;
  const by = status.index.byStatus || {};

  return (
    <>
      <dl>
        <Row label="Chat model" ok={status.chat.configured}>
          {status.chat.configured ? `${status.chat.provider} · ${status.chat.model}` : `Not configured${status.chat.reason ? ` (${status.chat.reason})` : ''}`}
        </Row>
        <Row label="Embeddings" ok={status.embeddings.configured}>
          {status.embeddings.configured
            ? `${status.embeddings.provider} · ${status.embeddings.model} (${status.embeddings.dimensions}d)`
            : 'Not configured. My Knowledge uses keyword search only.'}
        </Row>
        <Row label="Vector search">{status.vectorSearch}</Row>
        <Row label="Indexed passages">{status.index.embeddedPassages.toLocaleString()}</Row>
        <Row label="Items">
          {by.ready || 0} ready
          {working ? ` · ${working} in progress` : ''}
          {by.failed ? ` · ${by.failed} failed` : ''}
        </Row>
      </dl>
      {status.embeddings.configured && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" icon={RefreshCw} loading={busy} onClick={() => reindex(false)}>
            Index missing items
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirmForce(true)} disabled={busy}>
            Rebuild everything
          </Button>
        </div>
      )}
      <Dialog
        open={confirmForce}
        onClose={() => setConfirmForce(false)}
        title="Rebuild the whole semantic index?"
        description="Every passage in your library is embedded again. This uses embedding API credits and is only needed after changing the embedding model."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmForce(false)}>
              Cancel
            </Button>
            <Button onClick={() => reindex(true)}>Rebuild</Button>
          </>
        }
      />
    </>
  );
}

export default function AiSection() {
  const { preferences, save } = usePreferences();
  const ai = preferences.ai;

  return (
    <>
      <Card className="p-5 sm:p-6">
        <CardHeader eyebrow="Answer mode" title="Default for new conversations" />
        <p className="mt-1 mb-5 font-ui text-sm text-ink-muted">You can switch modes at any time inside a chat without losing the conversation.</p>
        <ChoiceCards columns={2} label="Default answer mode" value={normalizeMode(ai.defaultMode)} onChange={(v) => save({ ai: { defaultMode: v } })} options={ANSWER_MODE_OPTIONS} />
      </Card>

      <Card className="p-5 sm:p-6">
        <CardHeader eyebrow="Responses" title="How the assistant writes" />
        <div className="mt-5 space-y-5">
          <SelectField label="Response style" value={ai.responseStyle} onChange={(e) => save({ ai: { responseStyle: e.target.value } })} options={STYLES} className="max-w-md" />
          <hr className="mm-rule" />
          <Toggle
            label="Suggest follow-up questions"
            description="Offer up to three next questions after each answer."
            checked={ai.showFollowUps}
            onChange={(v) => save({ ai: { showFollowUps: v } })}
          />
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <CardHeader eyebrow="Server" title="AI status and semantic index" />
        <p className="mt-1 mb-4 font-ui text-sm text-ink-muted">API keys stay on the server and are never sent to your browser.</p>
        <AiStatus />
      </Card>
    </>
  );
}
