import { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy } from 'lucide-react';
import { cn } from '../../lib/cn.js';

/**
 * Turns [n] markers into links to citation anchors, but only for numbers that correspond to
 * passages that were really retrieved. Code spans and fenced blocks are left untouched.
 */
export function linkCitations(text, validNumbers) {
  if (!validNumbers?.size) return text;
  return text
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(/\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\](?!\()/g, (match, list) => {
            const nums = list.split(',').map((n) => Number(n.trim()));
            if (!nums.every((n) => validNumbers.has(n))) return match;
            return nums.map((n) => `[${n}](#cite-${n})`).join('');
          })
    )
    .join('');
}

function CodeBlock({ children, ...props }) {
  const [copied, setCopied] = useState(false);
  const codeEl = Array.isArray(children) ? children[0] : children;
  const lang = /language-([\w-]+)/.exec(codeEl?.props?.className || '')?.[1];
  const text = (function extract(node) {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(extract).join('');
    return node?.props?.children ? extract(node.props.children) : '';
  })(codeEl);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text.replace(/\n$/, ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="mm-codeblock group relative">
      <div className="flex items-center justify-between px-3 pt-2 font-mono text-[0.68rem] tracking-wider text-[#a9a3c0] uppercase">
        <span>{lang || 'code'}</span>
        <button type="button" onClick={copy} className="flex items-center gap-1 rounded px-1.5 py-0.5 normal-case hover:bg-white/10 hover:text-white" aria-label="Copy code">
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre {...props}>{children}</pre>
    </div>
  );
}

/** Safe Markdown: no raw HTML, external links open in a new tab, citations become chips. */
function Markdown({ text, citations, onCite, className }) {
  const valid = new Set((citations || []).map((c) => c.n));
  const byN = new Map((citations || []).map((c) => [c.n, c]));
  return (
    <div className={cn('mm-prose mm-prose-chat', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre: CodeBlock,
          a: ({ href = '', children, ...rest }) => {
            const m = href.match(/^#cite-(\d+)$/);
            if (m) {
              const c = byN.get(Number(m[1]));
              return (
                <button
                  type="button"
                  className="mm-cite"
                  onClick={() => onCite?.(Number(m[1]))}
                  title={c ? `${c.title}${c.page ? `, p. ${c.page}` : ''}` : undefined}
                  aria-label={`Source ${m[1]}${c ? `: ${c.title}` : ''}`}
                >
                  {m[1]}
                </button>
              );
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow" {...rest}>
                {children}
              </a>
            );
          },
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {linkCitations(text || '', valid)}
      </ReactMarkdown>
    </div>
  );
}

export default memo(Markdown);
