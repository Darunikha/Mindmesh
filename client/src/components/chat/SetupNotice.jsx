import { KeyRound } from 'lucide-react';

/** Shown instead of the composer when the server has no AI provider configured. */
export default function SetupNotice({ status }) {
  return (
    <div className="mm-card mm-card-ruled p-5" role="status">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent">
          <KeyRound size={17} aria-hidden />
        </span>
        <div className="min-w-0 font-ui text-sm text-ink-muted">
          <p className="font-semibold text-ink">The AI assistant isn’t set up on this server yet</p>
          <p className="mt-1">
            Mindmesh never invents answers, so chat stays off until an AI provider is configured. Add an API key to <code className="font-mono text-xs">server/.env</code> and restart the server:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-control bg-sunken p-3 font-mono text-xs text-ink">
            {`AI_PROVIDER=anthropic\nANTHROPIC_API_KEY=sk-ant-...\n\n# Optional, for semantic search in My Knowledge mode\nEMBEDDING_PROVIDER=voyage\nVOYAGE_API_KEY=pa-...`}
          </pre>
          {status?.chat?.reason && <p className="mt-2 text-xs text-ink-faint">Server says: {status.chat.reason}</p>}
          <p className="mt-2 text-xs text-ink-faint">Your past conversations remain readable in the meantime.</p>
        </div>
      </div>
    </div>
  );
}
