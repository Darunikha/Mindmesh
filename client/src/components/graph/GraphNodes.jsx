import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Folder, Hash, Pin } from 'lucide-react';
import { TYPE_ICONS, TYPE_TINT } from '../library/resourceMeta.js';
import { cn } from '../../lib/cn.js';

function stateClasses(data, selected) {
  return cn('mm-gnode', data.dim && 'is-dim', data.match && 'is-match', selected && 'selected-node');
}

/**
 * Edges attach to an invisible handle at the node's centre ("c"), so links are drawn as
 * straight lines between centres. Resource nodes also expose visible side handles used only
 * for drag-to-connect.
 */
function CenterHandles() {
  return (
    <>
      <Handle id="c" type="source" position={Position.Top} className="mm-center-handle" isConnectable={false} />
      <Handle id="c" type="target" position={Position.Top} className="mm-center-handle" isConnectable={false} />
    </>
  );
}

/** A note, document or link. Size grows gently with the number of connections. */
export const ResourceNode = memo(function ResourceNode({ data, selected }) {
  const Icon = TYPE_ICONS[data.resourceType];
  const tint = TYPE_TINT[data.resourceType];
  const width = Math.min(220, 150 + (data.degree || 0) * 8);
  return (
    <div className={cn(stateClasses(data, selected), 'mm-gnode-resource px-3 py-2')} style={{ width }}>
      <CenterHandles />
      <Handle id="in" type="target" position={Position.Left} title="Drop a connection here" />
      <div className="flex items-start gap-2">
        <span className={cn('mt-0.5 shrink-0', tint.fg)}>
          <Icon size={14} aria-hidden />
        </span>
        <span className="line-clamp-2 text-[0.8rem] leading-snug font-semibold text-ink">{data.label}</span>
        {data.pinned && <Pin size={11} className="mt-0.5 ml-auto shrink-0 text-accent" aria-label="Pinned" />}
      </div>
      <Handle id="out" type="source" position={Position.Right} title="Drag to another item to connect" />
    </div>
  );
});

export const TopicNode = memo(function TopicNode({ data, selected }) {
  return (
    <div className={cn(stateClasses(data, selected), 'mm-gnode-topic flex items-center gap-1 px-3 py-1 text-[0.78rem] whitespace-nowrap')}>
      <CenterHandles />
      <Hash size={11} aria-hidden />
      {data.label}
    </div>
  );
});

export const CollectionNode = memo(function CollectionNode({ data, selected }) {
  return (
    <div className={cn(stateClasses(data, selected), 'mm-gnode-collection flex items-center gap-1.5 px-3 py-1.5 text-[0.8rem] whitespace-nowrap')}>
      <CenterHandles />
      <Folder size={13} aria-hidden />
      {data.label}
    </div>
  );
});

export const nodeTypes = { resource: ResourceNode, topic: TopicNode, collection: CollectionNode };
