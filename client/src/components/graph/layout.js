import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

const RADIUS = { resource: 100, topic: 55, collection: 70 };
const DISTANCE = { topic: 150, collection: 170, nested: 150, manual: 220, ai: 220 };

/**
 * Force-directed layout. Nodes the user has already placed stay fixed; the rest settle
 * around them. Runs synchronously (300 ticks) so the first paint is already arranged.
 */
export function computeLayout(nodes, edges) {
  const sim = nodes.map((n) => ({
    id: n.id,
    kind: n.kind,
    x: n.position?.x ?? (hash(n.id) - 0.5) * 900,
    y: n.position?.y ?? (hash(`${n.id}y`) - 0.5) * 700,
    ...(n.position ? { fx: n.position.x, fy: n.position.y } : {}),
  }));
  const ids = new Set(sim.map((n) => n.id));
  const links = edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({ source: e.source, target: e.target, kind: e.kind }));

  if (sim.every((n) => n.fx !== undefined)) return new Map(sim.map((n) => [n.id, { x: n.fx, y: n.fy }]));

  const simulation = forceSimulation(sim)
    .force('charge', forceManyBody().strength(-520).distanceMax(900))
    .force(
      'link',
      forceLink(links)
        .id((d) => d.id)
        .distance((l) => DISTANCE[l.kind] || 180)
        .strength((l) => (l.kind === 'manual' || l.kind === 'ai' ? 0.5 : 0.3))
    )
    .force('collide', forceCollide().radius((d) => RADIUS[d.kind] || 80))
    .force('x', forceX(0).strength(0.04))
    .force('y', forceY(0).strength(0.04))
    .stop();
  for (let i = 0; i < 300; i++) simulation.tick();
  return new Map(sim.map((n) => [n.id, { x: Math.round(n.x), y: Math.round(n.y) }]));
}
