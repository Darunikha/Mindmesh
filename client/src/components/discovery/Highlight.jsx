/** Renders text with <mark> around the given [start, end) ranges (no HTML injection). */
export default function Highlight({ text, ranges, className }) {
  if (!ranges?.length) return <span className={className}>{text}</span>;
  const parts = [];
  let cursor = 0;
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  sorted.forEach(([s, e], i) => {
    if (s < cursor) return;
    if (s > cursor) parts.push(text.slice(cursor, s));
    parts.push(
      <mark key={i} className="mm-mark">
        {text.slice(s, e)}
      </mark>
    );
    cursor = e;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <span className={className}>{parts}</span>;
}
