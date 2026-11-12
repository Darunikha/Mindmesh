import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Folder, Hash, Pin } from 'lucide-react';
import { TYPE_ICONS, TYPE_TINT } from '../library/resourceMeta.js';
import { cn } from '../../lib/cn.js';

function stateClasses(data, selected) {
  return cn('mm-gnode', data.dim && 'is-dim', data.match && 'is-match', selected && 'selected-node');
}

/** A note, document or link. Size grows gently with the number of connections. */
export const ResourceNode = memo(function ResourceNode({ data, selected }) {
  const Icon = TYPE_ICONS[data.resourceType];
  const tint = TYPE_TINT[data.resourceType];
  const width = Math.min(220, 150 + (data.degree || 0) * 8);
  return (
    <div className={cn(stateClasses(data, selected), 'mm-gnode-resource px-3 py-2')} style={{ width }}>
      <Handle type="target" position={Position.Left} />
      <div className="flex items-start gap-2">
        <span className={cn('mt-0.5 shrink-0', tint.fg)}>
          <Icon size={14} aria-hidden />
        </span>
        <span className="line-clamp-2 text-[0.8rem] leading-snug font-semibold text-ink">{data.label}</span>
        {data.pinned && <Pin size={11} className="mt-0.5 ml-auto shrink-0 text-accent" aria-label="Pinned" />}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
});

export const TopicNode = memo(function TopicNode({ data, selected }) {
  return (
    <div className={cn(stateClasses(data, selected), 'mm-gnode-topic flex items-center gap-1 px-3 py-1 text-[0.78rem] whitespace-nowrap')}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <Hash size={11} aria-hidden />
      {data.label}
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
});

export const CollectionNode = memo(function CollectionNode({ data, selected }) {
  return (
    <div className={cn(stateClasses(data, selected), 'mm-gnode-collection flex items-center gap-1.5 px-3 py-1.5 text-[0.8rem] whitespace-nowrap')}>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <Folder size={13} aria-hidden />
      {data.label}
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  );
});

export const nodeTypes = { resource: ResourceNode, topic: TopicNode, collection: CollectionNode };
