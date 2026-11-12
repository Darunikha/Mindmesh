import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import Highlight from '../components/discovery/Highlight.jsx';
import { computeLayout } from '../components/graph/layout.js';
import { formatBytes, resourceDetail } from '../components/library/resourceMeta.js';
import { describeUserAgent, firstName } from './format.js';
import { flattenTree } from '../context/LibraryContext.jsx';

afterEach(cleanup);

describe('Highlight', () => {
  it('wraps the given ranges in <mark> without injecting HTML', () => {
    const { container } = render(<Highlight text="Gradient <b>descent</b> descends" ranges={[[0, 8], [24, 32]]} />);
    expect([...container.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['Gradient', 'descends']);
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toBe('Gradient <b>descent</b> descends');
  });
});

describe('computeLayout', () => {
  it('keeps nodes the user placed and positions the rest without overlaps at the same point', () => {
    const nodes = [
      { id: 'r:a', kind: 'resource', position: { x: 10, y: 20 } },
      { id: 'r:b', kind: 'resource' },
      { id: 't:c', kind: 'topic' },
    ];
    const pos = computeLayout(nodes, [{ source: 'r:a', target: 't:c', kind: 'topic' }]);
    expect(pos.get('r:a')).toEqual({ x: 10, y: 20 });
    expect(pos.get('r:b')).not.toEqual(pos.get('t:c'));
    // Deterministic: the same input lays out the same way.
    expect(computeLayout(nodes, [])).toEqual(computeLayout(nodes, []));
  });
});

describe('formatting helpers', () => {
  it('describes resources and sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(resourceDetail({ type: 'note', note: { wordCount: 1204 } })).toMatch(/1.?204 words/);
    expect(resourceDetail({ type: 'document', file: { label: 'PDF', pageCount: 1, size: 1024 } })).toBe('PDF · 1 page · 1.0 KB');
    expect(resourceDetail({ type: 'link', link: { domain: 'example.com' } })).toBe('example.com');
  });

  it('names devices and people', () => {
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/130 Safari/537')).toBe('Chrome on Windows');
    expect(describeUserAgent('')).toBe('Unknown device');
    expect(firstName('  Ada   Lovelace ')).toBe('Ada');
  });

  it('builds the collection tree in order with depth and paths', () => {
    const flat = flattenTree([
      { id: '2', name: 'Physics', parentId: '1' },
      { id: '1', name: 'Science', parentId: null },
      { id: '3', name: 'Art', parentId: null },
    ]);
    expect(flat.map((c) => [c.name, c.depth, c.path])).toEqual([
      ['Art', 0, 'Art'],
      ['Science', 0, 'Science'],
      ['Physics', 1, 'Science / Physics'],
    ]);
  });
});
